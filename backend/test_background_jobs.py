"""The slow email jobs run in the background so the cron request returns fast."""
import threading
import time

from backend.routes import jobs


def test_run_in_background_runs_once_at_a_time():
    gate = threading.Event()
    done = threading.Event()

    class FakeApp:
        def app_context(self):
            class Ctx:
                def __enter__(self_inner):
                    return None

                def __exit__(self_inner, *a):
                    return False

            return Ctx()

    def slow():
        gate.wait(2)
        done.set()

    assert jobs._run_in_background(FakeApp(), "t-job", slow) is True
    assert jobs._run_in_background(FakeApp(), "t-job", slow) is False
    gate.set()
    assert done.wait(2)
    for _ in range(50):
        if "t-job" not in jobs._running_jobs:
            break
        time.sleep(0.02)
    assert jobs._run_in_background(FakeApp(), "t-job", lambda: None) is True


def test_failing_job_frees_its_slot():
    class FakeApp:
        def app_context(self):
            class Ctx:
                def __enter__(self_inner):
                    return None

                def __exit__(self_inner, *a):
                    return False

            return Ctx()

    ran = threading.Event()

    def boom():
        ran.set()
        raise RuntimeError("x")

    assert jobs._run_in_background(FakeApp(), "boom-job", boom) is True
    assert ran.wait(2)
    for _ in range(100):
        if "boom-job" not in jobs._running_jobs:
            break
        time.sleep(0.02)
    assert "boom-job" not in jobs._running_jobs
