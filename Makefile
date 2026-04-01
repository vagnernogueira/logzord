.PHONY: run stop build logs clean log-gen stop-log-gen reset-log-gen

# Como estamos operando com podman, usaremos podman-compose ou o comando nativo podman compose
COMPOSE ?= podman compose
LOG_GENERATOR_SCRIPT ?= ./wkr/generate-logs.sh
LOG_GENERATOR_PIDFILE ?= ./wkr/generate-logs.pid
LOG_GENERATOR_OUT ?= ./wkr/generate-logs.out

run:
	@echo "Subindo os serviços do Logzord..."
	$(COMPOSE) up -d

stop:
	@echo "Parando os serviços do Logzord..."
	$(COMPOSE) down

build:
	@echo "Construindo as imagens do projeto..."
	$(COMPOSE) build

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