PY ?= python3

.PHONY: test test-js ui-check run demo export verify status
test:      ## run the full offline test suite
	$(PY) -m unittest discover -s tests -t . -v
test-js:   ## front-end unit tests (node, no dependencies)
	node --test web/tests/*.test.mjs
ui-check:  ## browser checks + measurements against a temp synthetic state (needs Playwright + Chromium)
	node scripts/ui_check.mjs
run:       ## start the control room on http://127.0.0.1:8765
	$(PY) -m lql.server
demo:      ## two demo backtests + 300 paper sessions (synthetic)
	$(PY) -m lql.cli demo
verify:    ## run each milestone's tests and let the supervisor record evidence
	$(PY) scripts/verify.py
export:    ## secret-scanned context bundle in exports/
	$(PY) -m lql.cli export
status:
	$(PY) -m lql.cli status
