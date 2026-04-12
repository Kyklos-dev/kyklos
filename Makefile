.PHONY: all build build-ui test setup run clean

all: build

VENV ?= $(HOME)/.kyklos/venv

## setup: create Python venv and install the kyklos SDK + step dependencies
setup:
	python3 -m venv $(VENV)
	$(VENV)/bin/pip install --upgrade pip
	$(VENV)/bin/pip install -e sdk/python/
	$(VENV)/bin/pip install jsonschema deepeval litellm
	@echo "Optional LLM runners: pip install anthropic openai google-generativeai"
	@echo ""
	@echo "Setup complete. Add to kyklos-server.yaml:"
	@echo "  server:"
	@echo "    python_venv: \"$(VENV)\""

## run: start the server (no dashboard rebuild; uses embedded dist)
run:
	KYKLOS_STEPS_DIR=$(CURDIR)/steps go run ./cmd/kyklos

## build-ui: compile the React dashboard and copy it into web/dist
build-ui:
	cd dashboard && npm ci && npm run build
	rm -rf web/dist
	cp -r dashboard/dist web/dist

## build: build-ui then compile the Go binary
build: build-ui
	go build -o bin/kyklos ./cmd/kyklos

## test: run all Go tests
test:
	go test ./...

## clean: remove compiled artifacts
clean:
	rm -rf bin web/dist dashboard/dist
