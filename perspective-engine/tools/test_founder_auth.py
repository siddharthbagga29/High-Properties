"""Founder-signed actions in tools/graph.py, checked with real ssh-keygen signatures.

Run: python3 -m unittest discover -s perspective-engine/tools -p 'test_*.py'
Skipped when ssh-keygen is not installed (graph.py then fails closed once a key is registered).
"""
import json
import pathlib
import shutil
import subprocess
import unittest

from test_audit import NOW, Tmp, build_fixture, graph_paths, run_graph
import audit
import graph

SSH = shutil.which("ssh-keygen")


def keypair(d, name):
    k = d / name
    subprocess.run([SSH, "-q", "-t", "ed25519", "-N", "", "-C", name, "-f", str(k)], check=True)
    return k, (d / f"{name}.pub").read_text().strip()


def sign(key, text, d, name="request.txt"):
    req = d / name
    req.write_text(text)
    subprocess.run([SSH, "-q", "-Y", "sign", "-f", str(key), "-n", "pe-founder", str(req)], check=True,
                   capture_output=True)
    return str(req) + ".sig"


@unittest.skipUnless(SSH, "ssh-keygen not installed")
class FounderSignedActions(Tmp):
    def setUp(self):
        super().setUp()
        self.pe = build_fixture(self.root)
        (self.pe / "graph" / "revenue.jsonl").unlink()
        self.keys = self.root / "keys"
        self.keys.mkdir()
        self.founder, self.founder_pub = keypair(self.keys, "founder")
        self.agent, self.agent_pub = keypair(self.keys, "agent")
        self.ctx = graph_paths(self.root)
        self.ctx.__enter__()

    def tearDown(self):
        self.ctx.__exit__(None, None, None)
        super().tearDown()

    def node(self, i):
        return graph.index(graph.load())[i]

    def ledger(self):
        return [json.loads(x) for x in (self.pe / "graph" / "ledger.jsonl").read_text().splitlines()]

    def request(self, *argv):
        rc, out = run_graph("authorize", *argv)
        self.assertEqual(rc, 0, out)
        return out

    def test_before_a_key_is_registered_actions_are_attested_not_signed(self):
        rc, out = run_graph("clear-gate", "A2", "founder approved")
        self.assertEqual(rc, 0, out)
        self.assertIn("attested, not signed", out)
        self.assertEqual(self.ledger()[-1]["auth"], "attested")

    def test_registered_key_requires_a_valid_signature_for_that_exact_action(self):
        self.assertEqual(run_graph("founder-key", self.founder_pub)[0], 0)
        self.assertEqual(self.ledger()[-1]["event"], "founder-key")
        # no signature: refused, and the request to sign is printed
        rc, out = run_graph("clear-gate", "A2", "founder approved batch 1")
        self.assertEqual(rc, 1)
        self.assertIn("action: clear-gate", out)
        self.assertEqual(self.node("A2")["status"], "awaiting_human")
        # an agent's own key: refused
        bad = sign(self.agent, self.request("clear-gate", "A2", "founder approved batch 1"), self.keys, "a.txt")
        self.assertEqual(run_graph("clear-gate", "A2", "founder approved batch 1", "--sig", bad)[0], 1)
        # the founder's signature over a different note: refused
        other = sign(self.founder, self.request("clear-gate", "A2", "something else"), self.keys, "o.txt")
        self.assertEqual(run_graph("clear-gate", "A2", "founder approved batch 1", "--sig", other)[0], 1)
        self.assertEqual(self.node("A2")["status"], "awaiting_human")
        # the founder's signature over this exact action: accepted and recorded
        good = sign(self.founder, self.request("clear-gate", "A2", "founder approved batch 1"), self.keys)
        rc, out = run_graph("clear-gate", "A2", "founder approved batch 1", "--sig", good)
        self.assertEqual(rc, 0, out)
        self.assertEqual(self.node("A2")["status"], "done")
        self.assertEqual(self.ledger()[-1]["auth"], "signed")
        rows = [json.loads(x) for x in (self.pe / "graph" / "founder-auth.jsonl").read_text().splitlines()]
        self.assertEqual(rows[-1]["action"], "clear-gate")
        # replaying the same signature later is refused: the record has moved on
        run_graph("block", "A3", "test")
        self.assertEqual(run_graph("unblock", "A3", "founder approved batch 1", "--sig", good)[0], 1)
        self.assertEqual(self.node("A3")["status"], "blocked")

    def test_revenue_needs_the_founder_signature_once_a_key_exists(self):
        run_graph("founder-key", self.founder_pub)
        argv = ["revenue", "add", "1500", "Acme", "--evidence", "INV-1"]
        self.assertEqual(run_graph(*argv, "--founder")[0], 1)  # --founder alone is no longer enough
        forged = sign(self.agent, self.request(*argv), self.keys, "f.txt")
        self.assertEqual(run_graph(*argv, "--founder", "--sig", forged)[0], 1)
        self.assertFalse((self.pe / "graph" / "revenue.jsonl").exists())
        good = sign(self.founder, self.request(*argv), self.keys)
        rc, out = run_graph(*argv, "--founder", "--sig", good)
        self.assertEqual(rc, 0, out)
        row = json.loads((self.pe / "graph" / "revenue.jsonl").read_text().splitlines()[0])
        self.assertEqual((row["amountUsd"], row["auth"]), (1500.0, "signed"))

    def test_an_agent_cannot_swap_in_its_own_key(self):
        run_graph("founder-key", self.founder_pub)
        self.assertEqual(run_graph("founder-key", self.agent_pub)[0], 1)
        self_signed = sign(self.agent, graph.auth_message("founder-key", [("key", self.agent_pub.rsplit(" ", 1)[0])]),
                           self.keys, "s.txt")
        self.assertEqual(run_graph("founder-key", self.agent_pub, "--sig", self_signed)[0], 1)
        self.assertIn(self.founder_pub.rsplit(" ", 1)[0], (self.pe / "graph" / "founder.allowed_signers").read_text())

    def test_auditor_reverifies_signatures_and_flags_unsigned_actions(self):
        run_graph("founder-key", self.founder_pub)
        good = sign(self.founder, self.request("clear-gate", "A2", "ok"), self.keys)
        run_graph("clear-gate", "A2", "ok", "--sig", good)
        r = audit.compute(self.pe, NOW)
        self.assertEqual((r["founderAuth"]["signatures"], r["founderAuth"]["verified"]), (1, 1))
        self.assertFalse(any(f["id"].startswith("AUTO-AUTH") for c in r["scorecards"] for f in c["findings"]))
        # someone bypasses graph.py and appends an unsigned clear-gate and a tampered signature row
        with (self.pe / "graph" / "ledger.jsonl").open("a") as f:
            f.write(json.dumps({"t": "2099-01-01T00:00:00Z", "event": "clear-gate", "node": "A2", "note": "x"}) + "\n")
        p = self.pe / "graph" / "founder-auth.jsonl"
        row = json.loads(p.read_text().splitlines()[0])
        row["msg"] = row["msg"].replace("note: ok", "note: changed")
        with p.open("a") as f:
            f.write(json.dumps(row) + "\n")
        r = audit.compute(self.pe, NOW)
        auto = [f for c in r["scorecards"] for f in c["findings"] if f["id"].startswith("AUTO-AUTH")]
        self.assertEqual(len(auto), 2)
        self.assertTrue(all(f["severity"] == "critical" for f in auto))

    def test_fails_closed_without_ssh_keygen(self):
        run_graph("founder-key", self.founder_pub)
        good = sign(self.founder, self.request("clear-gate", "A2", "ok"), self.keys)
        real = shutil.which
        try:
            graph.shutil.which = lambda name: None if name == "ssh-keygen" else real(name)
            self.assertEqual(run_graph("clear-gate", "A2", "ok", "--sig", good)[0], 1)
        finally:
            graph.shutil.which = real
        self.assertEqual(self.node("A2")["status"], "awaiting_human")


if __name__ == "__main__":
    unittest.main()
