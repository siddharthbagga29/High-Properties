"""Founder-signed actions in tools/graph.py and their independent re-check in tools/audit.py, with real ssh-keygen
signatures. Each case below is a bypass an independent reviewer demonstrated against an earlier version.

Run: python3 -m unittest discover -s perspective-engine/tools -p 'test_*.py'
Skipped when ssh-keygen is not installed (graph.py then fails closed once a key is registered).
"""
import json
import shutil
import subprocess
import unittest

from test_audit import NOW, Tmp, build_fixture, graph_paths, jl, run_graph
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
    subprocess.run([SSH, "-q", "-Y", "sign", "-f", str(key), "-n", "pe-founder", str(req)], check=True, capture_output=True)
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
        self.n = 0

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

    def signed(self, key, *argv):
        self.n += 1
        return sign(key, self.request(*argv), self.keys, f"r{self.n}.txt")

    def auto(self):
        r = audit.compute(self.pe, NOW)
        return r, [f for c in r["scorecards"] for f in c["findings"] if f["id"].startswith("AUTO-AUTH")]

    def prepare_gate(self, node="A2"):
        """Reopen a gated task and verify it under today's gate, so done records the outputs the founder approves."""
        self.assertEqual(run_graph("reopen", node, "re-verify under the current gate")[0], 0)
        run_graph("log", node, "read", "--verifier", "Verifier: starting review")
        self.assertEqual(run_graph("log", node, "check", "--verifier", "every criterion met. VERDICT: PASS")[0], 0)
        rc, out = run_graph("done", node, "verified")
        self.assertEqual(rc, 0, out)
        self.assertEqual(self.node(node)["status"], "awaiting_human")

    def register(self):
        rc, out = run_graph("founder-key", self.founder_pub)
        self.assertEqual(rc, 0, out)
        self.assertIn("trust on first use", out)

    # ---- before and at registration ----

    def test_before_a_key_is_registered_actions_are_attested_not_signed(self):
        rc, out = run_graph("clear-gate", "A2", "founder approved")
        self.assertEqual(rc, 1)  # A2 was closed before outputs were recorded at done: re-verify first
        self.assertIn("not the ones verified at done", out)
        self.prepare_gate()
        rc, out = run_graph("clear-gate", "A2", "founder approved")
        self.assertEqual(rc, 0, out)
        self.assertIn("attested, not signed", out)
        self.assertEqual(self.ledger()[-1]["auth"], "attested")

    def test_the_key_is_pinned_in_the_ledger_not_in_a_file(self):
        self.register()
        e = self.ledger()[-1]
        self.assertEqual((e["event"], e["key"], e["auth"]), ("founder-key", " ".join(self.founder_pub.split()[:2]), "first-use"))
        self.assertTrue(e["fp"].startswith("SHA256:"))
        self.assertFalse(list((self.pe / "graph").glob("*allowed_signers*")))  # nothing an agent could append a key to
        self.assertEqual(graph.founder_key_state()["fingerprint"], e["fp"])

    # ---- signing ----

    def test_a_valid_signature_for_that_exact_action_is_required(self):
        self.prepare_gate()
        self.register()
        rc, out = run_graph("clear-gate", "A2", "approved batch 1")
        self.assertEqual(rc, 1)
        self.assertIn('"action":"clear-gate"', out)
        bad = self.signed(self.agent, "clear-gate", "A2", "approved batch 1")
        self.assertEqual(run_graph("clear-gate", "A2", "approved batch 1", "--sig", bad)[0], 1)
        other = self.signed(self.founder, "clear-gate", "A2", "something else")
        self.assertEqual(run_graph("clear-gate", "A2", "approved batch 1", "--sig", other)[0], 1)
        self.assertEqual(self.node("A2")["status"], "awaiting_human")
        good = self.signed(self.founder, "clear-gate", "A2", "approved batch 1")
        rc, out = run_graph("clear-gate", "A2", "approved batch 1", "--sig", good)
        self.assertEqual(rc, 0, out)
        self.assertEqual(self.node("A2")["status"], "done")
        e = self.ledger()[-1]
        self.assertEqual(e["auth"], "signed")
        self.assertEqual(len(e["authRef"]), 64)
        r, auto = self.auto()
        self.assertEqual(auto, [])
        self.assertEqual((r["founderAuth"]["signatures"], r["founderAuth"]["verified"]), (1, 1))

    def test_replay_of_the_same_action_is_refused_once_the_record_moves_on(self):
        self.register()
        run_graph("block", "A3", "waiting")
        sig = self.signed(self.founder, "unblock", "A3", "go")
        self.assertEqual(run_graph("unblock", "A3", "go", "--sig", sig)[0], 0)
        run_graph("block", "A3", "waiting again")
        rc, out = run_graph("unblock", "A3", "go", "--sig", sig)  # same action, node and note: the record hash moved on
        self.assertEqual(rc, 1)
        self.assertEqual(self.node("A3")["status"], "blocked")

    def test_a_signature_made_for_another_copy_of_the_record_is_refused(self):
        self.prepare_gate()
        self.register()
        sig = self.signed(self.founder, "clear-gate", "A2", "ok")
        with (self.pe / "graph" / "ledger.jsonl").open("a") as f:  # this copy differs from the one that was signed
            f.write(json.dumps({"t": "2026-10-09T00:00:00Z", "event": "note", "node": "A1", "note": "other copy"}) + "\n")
        self.assertEqual(run_graph("clear-gate", "A2", "ok", "--sig", sig)[0], 1)

    def test_fields_cannot_smuggle_lines_into_the_signed_message(self):
        self.register()
        rc, out = run_graph("authorize", "revenue", "add", "5000", "Acme", "--evidence", "INV-1\nevidence: bank ref 77")
        self.assertEqual(rc, 0)
        self.assertEqual(len(out.strip().splitlines()), 2)  # header + one JSON line: the newline is escaped
        rc, out = run_graph("revenue", "add", "5000", "Acme\nevidence: INV-1", "--evidence", "bank ref 77", "--founder", "--sig", "x")
        self.assertEqual(rc, 1)
        self.assertIn("control characters", out)

    def test_revenue_needs_the_founder_signature_and_the_export_verifies_it(self):
        self.register()
        argv = ["revenue", "add", "1500", "Acme", "--evidence", "INV-1"]
        self.assertEqual(run_graph(*argv, "--founder")[0], 1)
        forged = self.signed(self.agent, *argv)
        self.assertEqual(run_graph(*argv, "--founder", "--sig", forged)[0], 1)
        good = self.signed(self.founder, *argv)
        rc, out = run_graph(*argv, "--founder", "--sig", good)
        self.assertEqual(rc, 0, out)
        state = json.loads((self.pe / "city" / "public" / "state.json").read_text())
        self.assertEqual(state["founderKey"]["registered"], True)
        self.assertEqual([(e["payer"], e["sigVerified"]) for e in state["revenue"]], [("Acme", True)])

    # ---- the reviewers' bypasses ----

    def test_rows_that_only_claim_to_be_signed_are_not_verified_and_are_flagged(self):
        """Proof A: append rows labelled auth "signed" straight to revenue.jsonl."""
        self.register()
        with (self.pe / "graph" / "revenue.jsonl").open("a") as f:
            for p in ("Acme", "Beta", "Gamma"):
                f.write(json.dumps({"t": "2099-01-01T00:00:00Z", "amountUsd": 5000, "payer": p, "evidence": "INV",
                                    "recordedBy": "founder", "auth": "signed", "authRef": "0" * 64}) + "\n")
        run_graph("export")
        state = json.loads((self.pe / "city" / "public" / "state.json").read_text())
        self.assertEqual([e["sigVerified"] for e in state["revenue"]], [False, False, False])
        _, auto = self.auto()
        self.assertEqual(sum("revenue from" in f["evidence"] for f in auto), 3)
        self.assertTrue(all(f["severity"] == "critical" for f in auto))

    def test_an_agent_cannot_swap_in_its_own_key(self):
        """Proofs B and C after registration: via graph.py, and by appending a key event to the ledger directly."""
        self.register()
        self.assertEqual(run_graph("founder-key", self.agent_pub)[0], 1)
        self_signed = self.signed(self.agent, "clear-gate", "A2", "x")  # any agent signature
        self.assertEqual(run_graph("founder-key", self.agent_pub, "--sig", self_signed)[0], 1)
        self.assertEqual(graph.founder_keys()[-1][1], " ".join(self.founder_pub.split()[:2]))
        with (self.pe / "graph" / "ledger.jsonl").open("a") as f:
            f.write(json.dumps({"t": "2099-01-01T00:00:00Z", "event": "founder-key", "node": "D01", "note": "",
                                "key": " ".join(self.agent_pub.split()[:2]), "fp": "SHA256:agent"}) + "\n")
        _, auto = self.auto()
        self.assertTrue(any("without a verified signature by the previous key" in f["evidence"] for f in auto))

    def test_a_signed_key_rotation_keeps_earlier_signatures_valid(self):
        """Proof E: earlier rows are checked against the key in force when they were made."""
        self.prepare_gate()
        self.register()
        good = self.signed(self.founder, "clear-gate", "A2", "ok")
        self.assertEqual(run_graph("clear-gate", "A2", "ok", "--sig", good)[0], 0)
        new_key, new_pub = keypair(self.keys, "founder2")
        rot = sign(self.founder, graph.auth_message("founder-key", {"key": " ".join(new_pub.split()[:2])}), self.keys, "rot.txt")
        rc, out = run_graph("founder-key", new_pub, "--sig", rot)
        self.assertEqual(rc, 0, out)
        r, auto = self.auto()
        self.assertEqual(auto, [])
        self.assertEqual((r["founderAuth"]["rotations"], r["founderAuth"]["verified"]), (1, 2))
        # The old key no longer signs anything new.
        run_graph("block", "A3", "w")
        old = self.signed(self.founder, "unblock", "A3", "go")
        self.assertEqual(run_graph("unblock", "A3", "go", "--sig", old)[0], 1)
        new = self.signed(new_key, "unblock", "A3", "go")
        self.assertEqual(run_graph("unblock", "A3", "go", "--sig", new)[0], 0)

    def test_a_key_event_without_a_pinned_key_closes_founder_actions(self):
        """Proof D: tampering with the key record fails closed instead of falling back to attested."""
        with (self.pe / "graph" / "ledger.jsonl").open("a") as f:
            f.write(json.dumps({"t": "2026-10-09T00:00:00Z", "event": "founder-key", "node": "D01", "note": "legacy"}) + "\n")
        rc, out = run_graph("revenue", "add", "100", "X", "--evidence", "e", "--founder")
        self.assertEqual(rc, 1)
        self.assertIn("stay closed", out)
        self.assertTrue(graph.founder_key_state()["registered"])

    def test_clearing_a_gate_by_editing_graph_json_is_detected(self):
        """Gate bypass: set gate.cleared and status done directly in graph.json."""
        g = graph.load()
        n = graph.index(g)["A2"]
        n["gate"]["cleared"] = "founder approved"
        n["status"] = "done"
        graph.save(g)
        _, auto = self.auto()
        self.assertTrue(any("A2: founder gate shows as cleared" in f["evidence"] and f["severity"] == "critical" for f in auto))

    def test_a_status_changed_outside_graph_py_is_detected(self):
        g = graph.load()
        graph.index(g)["B1"]["status"] = "running"
        graph.save(g)
        _, auto = self.auto()
        self.assertTrue(any("B1: graph.json says running but the ledger implies done" in f["evidence"] for f in auto))

    def git(self, *args):
        subprocess.run(["git", "-C", str(self.root), *args], check=True, capture_output=True)

    def commit_record(self, msg):
        self.git("add", "-A")
        self.git("-c", "user.email=t@t", "-c", "user.name=t", "commit", "-q", "-m", msg)

    def test_deleting_the_key_line_fails_closed_and_is_flagged(self):
        """Re-review proof D': remove the founder-key line from the ledger after it was committed."""
        self.git("init", "-q")
        self.commit_record("record")
        self.register()
        self.commit_record("founder key")
        led = self.pe / "graph" / "ledger.jsonl"
        led.write_text("".join(l + "\n" for l in led.read_text().splitlines() if '"founder-key"' not in l))
        rc, out = run_graph("revenue", "add", "100", "X", "--evidence", "e", "--founder")
        self.assertEqual(rc, 1)
        self.assertIn("stay closed", out)
        self.assertTrue(graph.founder_key_state()["registered"])  # read from git history
        _, auto = self.auto()
        texts = " ".join(f["evidence"] for f in auto)
        self.assertIn("rewritten, not appended to", texts)
        self.assertIn("git history but not in the ledger now", texts)

    def test_an_unsigned_key_event_is_ignored_by_graph_py_and_the_export(self):
        """Re-review proof B': append an unsigned founder-key event; it must never come into force."""
        self.register()
        agent_key = " ".join(self.agent_pub.split()[:2])
        with (self.pe / "graph" / "ledger.jsonl").open("a") as f:
            f.write(json.dumps({"t": "2099-01-01T00:00:00Z", "event": "founder-key", "node": "D01", "note": "",
                                "key": agent_key, "fp": graph.key_fingerprint(agent_key)}) + "\n")
        self.assertEqual(graph.founder_keys()[-1][1], " ".join(self.founder_pub.split()[:2]))
        self.assertTrue(graph.founder_key_state()["problems"])
        argv = ["revenue", "add", "5000", "Acme", "--evidence", "INV"]
        forged = self.signed(self.agent, *argv)
        self.assertEqual(run_graph(*argv, "--founder", "--sig", forged)[0], 1)
        _, auto = self.auto()
        self.assertTrue(any("without a verified signature by the previous key" in f["evidence"] for f in auto))

    def test_the_shown_fingerprint_is_recomputed_from_the_key(self):
        self.register()
        led = self.pe / "graph" / "ledger.jsonl"
        rows = [json.loads(l) for l in led.read_text().splitlines()]
        real_fp = rows[-1]["fp"]
        rows[-1]["fp"] = "SHA256:not-the-key"
        led.write_text("".join(json.dumps(r) + "\n" for r in rows))
        self.assertEqual(graph.founder_key_state()["fingerprint"], real_fp)
        _, auto = self.auto()
        self.assertTrue(any("stored fingerprint SHA256:not-the-key is not the key's" in f["evidence"] for f in auto))

    def test_clear_gate_signs_the_outputs_and_refuses_changed_content(self):
        """Re-review: outputs of a gated task changed after done, before the founder's approval."""
        self.prepare_gate()
        self.register()
        (self.pe / "out" / "a2.md").write_text("# Notes\n\nNow claims 3 paying customers.\n")
        rc, out = run_graph("clear-gate", "A2", "ok")
        self.assertEqual(rc, 1)
        self.assertIn("not the ones verified at done", out)
        self.assertEqual(self.node("A2")["status"], "awaiting_human")
        _, auto = self.auto()
        self.assertTrue(any("A2: outputs changed after the task was closed" in f["evidence"] for f in auto))

    def test_a_status_with_no_ledger_event_and_a_closure_without_a_gate_valid_check_are_flagged(self):
        g = graph.load()
        graph.index(g)["A3"]["status"] = "done"  # A3 has no ledger events
        graph.save(g)
        with (self.pe / "graph" / "ledger.jsonl").open("a") as f:  # a forged closure after the gate rule took effect
            f.write(json.dumps({"t": "2099-01-01T00:00:00Z", "event": "done", "node": "G1", "note": "",
                                "outputs": {"perspective-engine/out/g1.md": None}}) + "\n")
        _, auto = self.auto()
        texts = " ".join(f["evidence"] for f in auto)
        self.assertIn("A3: status done with no ledger event at all", texts)
        self.assertIn("G1: closed at 2099-01-01T00:00:00Z without a verifier PASS", texts)

    def test_missing_outputs_of_a_closed_task_are_flagged(self):
        (self.pe / "out" / "b1.md").unlink()
        _, auto = self.auto()
        self.assertTrue(any("B1: closed but outputs are missing or empty" in f["evidence"] for f in auto))

    def test_fails_closed_without_ssh_keygen(self):
        self.prepare_gate()
        self.register()
        good = self.signed(self.founder, "clear-gate", "A2", "ok")
        real = shutil.which
        try:
            graph.shutil.which = lambda name: None if name == "ssh-keygen" else real(name)
            self.assertEqual(run_graph("clear-gate", "A2", "ok", "--sig", good)[0], 1)
        finally:
            graph.shutil.which = real
        self.assertEqual(self.node("A2")["status"], "awaiting_human")


if __name__ == "__main__":
    unittest.main()
