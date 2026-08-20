.PHONY: run stop build logs clean log-gen stop-log-gen reset-log-gen

# Como estamos operando com podman, usaremos podman-compose ou o comando nativo podman compose
COMPOSE ?= podman compose
CONTAINER_ENGINE ?= podman
LOG_GENERATOR_SCRIPT ?= ./wkr/generate-logs.sh
LOG_GENERATOR_PIDFILE ?= ./wkr/generate-logs.pid
LOG_GENERATOR_OUT ?= ./wkr/generate-logs.out

run:
	@echo "Subindo as imagens publicadas no GHCR (ghcr.io/vagnernogueira/logzord-*:latest), nao um build local. Para usar imagem local, veja os comentarios em compose.yaml."
	$(COMPOSE) pull
	$(COMPOSE) up -d

stop:
	@echo "Parando os serviços do Logzord..."
	$(COMPOSE) down

build:
	@set -eu; \
	if [ -z "$${GITHUB_TOKEN:-}" ]; then \
		echo "GITHUB_TOKEN precisa estar configurado para o build do frontend." >&2; \
		exit 1; \
	fi; \
	secret_file="$$(mktemp)"; \
	trap 'rm -f "$$secret_file"' EXIT; \
	chmod 600 "$$secret_file"; \
	printf '%s' "$$GITHUB_TOKEN" > "$$secret_file"; \
	echo "Construindo as imagens do projeto..."; \
	$(COMPOSE) build backend; \
	$(CONTAINER_ENGINE) build --secret id=GITHUB_TOKEN,src="$$secret_file",type=file -f frontend/Containerfile -t logzord-frontend frontend

logs:
	$(COMPOSE) logs -f

clean:
	@echo "Limpando os containers e volumes órfãos..."
	$(COMPOSE) down -v --remove-orphans

log-gen:
	@mkdir -p ./wkr
	@if [ -f "$(LOG_GENERATOR_PIDFILE)" ] && kill -0 "$$(cat "$(LOG_GENERATOR_PIDFILE)")" 2>/dev/null; then \
		echo "Gerador de logs já está em execução."; \
	else \
		echo "Iniciando gerador de logs..."; \
		nohup "$(LOG_GENERATOR_SCRIPT)" > "$(LOG_GENERATOR_OUT)" 2>&1 & \
		echo $$! > "$(LOG_GENERATOR_PIDFILE)"; \
		echo "PID salvo em $(LOG_GENERATOR_PIDFILE)"; \
	fi

stop-log-gen:
	@pidfile="$(LOG_GENERATOR_PIDFILE)"; \
	if [ ! -f "$$pidfile" ]; then \
		echo "Nenhum PID file encontrado em $$pidfile."; \
	elif kill -0 "$$(cat "$$pidfile")" 2>/dev/null; then \
		kill "$$(cat "$$pidfile")"; \
		rm -f "$$pidfile"; \
		echo "Gerador de logs encerrado."; \
	else \
		rm -f "$$pidfile"; \
		echo "PID file removido; gerador não estava em execução."; \
	fi

reset-log-gen:
	@mkdir -p ./wkr
	@: > ./wkr/sample.log
	@echo "Arquivo ./wkr/sample.log reiniciado."