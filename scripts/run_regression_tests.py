"""Run selected offline regressions and explicitly report deferred service tests."""
import argparse
from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
MODEL_SERVICE_MODULES = {
    'test_local_agent_routes.py',
    'test_workspace_model_transport.py',
    'test_workspace_agent.py',
    'test_workspace_evaluation.py',
    'test_authorized_catalog.py',
}
MODEL_SERVICE_TESTS = {
    'test_local_v4_runtime.LocalRuntimeTest.test_model_can_be_reused_and_provider_failure_keeps_basic_api_available',
}


def iter_tests(suite):
    for test in suite:
        if isinstance(test, unittest.TestSuite):
            yield from iter_tests(test)
        else:
            yield test


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--skip-model-service', action='store_true')
    args = parser.parse_args()
    sys.path.insert(0, str(ROOT/'tests'))
    suite = unittest.TestSuite()
    loader = unittest.TestLoader()
    skipped = []
    for source in sorted((ROOT/'tests').glob('test_*.py')):
        if args.skip_model_service and source.name in MODEL_SERVICE_MODULES:
            skipped.append(source.name)
            continue
        for test in iter_tests(loader.loadTestsFromName(source.stem)):
            if args.skip_model_service and test.id() in MODEL_SERVICE_TESTS:
                skipped.append(test.id())
                continue
            suite.addTest(test)
    print('Deferred model-service modules/tests: ' + (', '.join(skipped) or 'none'), flush=True)
    result = unittest.TextTestRunner(verbosity=2).run(suite)
    return 0 if result.wasSuccessful() else 1

if __name__ == '__main__':
    raise SystemExit(main())
