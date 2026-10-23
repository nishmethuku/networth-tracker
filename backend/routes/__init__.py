"""HTTP routes, grouped by topic. app.py builds the Flask app and the shared helpers; each module here adds its routes."""
from . import (
    account_data,
    accounts,
    ai,
    alerts_push,
    budget,
    goals,
    history,
    households,
    imports,
    jobs,
    liabilities,
    milestones,
    search,
)


def register_all(app, h):
    accounts.register(app, h)
    alerts_push.register(app, h)
    imports.register(app, h)
    history.register(app, h)
    households.register(app, h)
    jobs.register(app, h)
    search.register(app, h)
    ai.register(app, h)
    goals.register(app, h)
    liabilities.register(app, h)
    milestones.register(app, h)
    account_data.register(app, h)
    budget.register(app, h)
