.PHONY: run stop build logs clean

# Como estamos operando com podman, usaremos podman-compose ou o comando nativo podman compose
COMPOSE ?= podman compose

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