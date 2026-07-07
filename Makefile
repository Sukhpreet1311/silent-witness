.PHONY: install playground run test dashboard

install:
	uv sync

playground:
	uv run adk web app --host 127.0.0.1 --port 18081

dashboard:
	cd submission_frontend && npm install && npm run dev

run:
	uv run python -m app.agent_runtime_app

test:
	uv run pytest
