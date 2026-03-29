# Logzord PRD 📝

## Declaração do Problema ⚠️
Analistas de suporte e desenvolvedores precisam monitorar logs em tempo real em ambientes de produção complexos (como Kubernetes). Atualmente, a dificuldade em filtrar ruídos e a impossibilidade de isolar trechos específicos para análise imediata atrasam a resolução de incidentes críticos.

## Público-alvo 👥
* **Usuário Principal:** Analista de Suporte de TI (Monitoramento ativo).
* **Usuário Secundário:** Desenvolvedores (Análise post-mortem e debug).

## Histórias de Usuário 📖
1.  **Streaming e Sintaxe (P0):** Como analista, quero visualizar o log em tempo real com destaque de sintaxe (estilo IDE) para identificar erros visualmente em segundos.
2.  **Controle de Reprodução (P0):** Como analista, quero pausar o stream para ler uma linha e retomar exatamente de onde parei ao dar "Play".
3.  **Filtro Dinâmico (P0):** Como analista, quero filtrar o texto (ex: "ORA-") para ocultar linhas irrelevantes, mantendo o foco apenas nos dados de interesse sem perder o contexto na memória.
4.  **Seleção de Alvo (P1):** Como analista, quero escolher o serviço e o arquivo de log através de uma barra lateral intuitiva.
5.  **Navegação e Gravação (P1):** Como analista, quero navegar no tempo (Rewind/Fast Forward) e usar um botão "Record" 🔴 para salvar linhas filtradas em um quadro de análise temporário.
6.  **Exportação de Evidência (P1):** Como analista, quero baixar o log ou o quadro de análise, recebendo-o compactado automaticamente se for maior que 5MB.

## Critérios de Aceitação ✅
* **CA 1 - Configuração e Seleção:** A interface deve listar serviços e arquivos baseando-se estritamente em um arquivo JSON de configuração, sem interface de cadastro manual.
* **CA 2 - Fluxo de Pausa Técnico:** Ao pausar, o sistema interrompe a leitura do arquivo; ao despausar, a leitura deve recomeçar da última **linha** processada para garantir integridade.
* **CA 3 - Mecanismo de Record:** Enquanto o botão "Record" estiver ativo, cada linha renderizada (respeitando o filtro ativo) deve sofrer um *append* em um buffer temporário de análise.
* **CA 4 - Filtro Visual:** O filtro deve ocultar as linhas na tela, mas elas devem reaparecer instantaneamente caso o filtro seja removido (sem necessidade de reler o arquivo).
* **CA 5 - Compressão de Saída:** Arquivos de download > 5MB devem ser entregues em formato .zip ou .gz, sem limite de tamanho máximo para o processo de compressão.

## Fora do Escopo 🚫
* Telas de cadastro de paths ou servidores.
* Persistência de longo prazo do Quadro de Análise (limpo após fechar a sessão).
* Funcionalidades de edição ou deleção de linhas no arquivo original de log.

## Refinamento 🧠

A lógica do **Record** (CA 3) depende diretamente do **Filtro** (CA 4). Se o usuário estiver gravando o log e decidir **mudar o filtro** no meio da gravação, o "Quadro de Análise" deve conter apenas o que ele viu na tela naquele momento.
