# Recife Events Aggregator

Aplicacao Node.js para agregar eventos de Recife em uma base CSV local, com:
- scraping web via Puppeteer
- coleta complementar via Google Events API (SerpApi)
- auditoria detalhada de aprovacao/reprovacao por evento

## Visao Geral

O backend expoe uma API simples para:
- listar eventos salvos (`GET /api/events`)
- executar sincronizacao (`POST /api/scrape`)
- marcar/desmarcar evento salvo (`POST /api/events/:id/toggle-save`)

O frontend (pasta `public/`) consome essa API e mostra os cards de eventos.

## Arquitetura Atual

### Backend
- `src/app.js`
  - inicializa o servidor Express em `http://localhost:3000`
  - serve arquivos estaticos de `public/`
  - registra as rotas da API

- `src/controllers/eventController.js`
  - camada HTTP
  - chama os services para leitura, scraping e toggle de saved

- `src/services/scraperService.js`
  - orquestrador principal da sincronizacao
  - executa scraping web e depois Google API
  - aplica filtros de qualidade e janela de datas
  - escreve auditoria e log de execucao
  - gera os objetos finais que entram no `events.csv`

- `src/services/webScraperService.js`
  - scraping via Puppeteer nas fontes configuradas em `SCRAPER_SOURCES`
  - extracao inicial por links/cards
  - enriquecimento em pagina de detalhe (JSON-LD quando disponivel)
  - deduplicacao por link dentro do lote web

- `src/services/databaseService.js`
  - leitura e escrita do `data/events.csv`
  - validacao de data e deduplicacao final antes de persistir

### Frontend
- `public/index.html`, `public/style.css`, `public/script.js`
  - listagem
  - filtros
  - ordenacao por data
  - acao salvar/desalvar

## Como o `events.csv` e montado

Fluxo da sincronizacao (`POST /api/scrape`):

1. Carrega base atual com `readEvents()`.
2. Calcula proximo `id` sequencial.
3. Monta indices de duplicidade:
   - nomes ja existentes no CSV
   - nomes ja adicionados no lote atual
4. Define janela de datas (hoje ate ultimo dia do mes seguinte).
5. Coleta web (`scrapeAllWebsites()`), filtra e gera candidatos aprovados.
6. Coleta Google API (paginas `start=0,10,20...`), filtra e gera candidatos aprovados.
7. Cada item processado (aprovado ou nao) entra em `data/auditoria.csv` com motivo.
8. Junta `currentDb + allNewEvents`.
9. Persiste com `saveEvents()`:
   - remove invalidos
   - remove datas passadas
   - deduplica por chave canonica (`nome|data|local|link`)
10. Grava resumo em `data/scrape_execucoes.log`.

Observacoes:
- O campo de pago/gratuito esta temporariamente desabilitado no fluxo atual.
- O frontend atualmente nao exibe a linha de preco.

## Fontes de Scraping Web

Definidas em `src/services/webScraperService.js` no `SCRAPER_SOURCES`.

Atualmente ativas:
- Sympla
- Ingresso.com
- Recife Ingressos
- Conecta Recife

Cada fonte pode ter:
- `key`
- `label`
- `url`
- `hostHints`
- `fallbackUrls`

## Auditoria e Logs

- `data/auditoria.csv`
  - registra itens brutos das fontes web e da Google API
  - colunas incluem `aprovado` e `motivo_exclusao`

- `data/scrape_execucoes.log`
  - resumo por execucao:
  - intervalo de datas
  - brutos
  - deduplicados
  - salvos no `events.csv`

## Estrutura de Pastas

```text
.
|-- data/
|   |-- events.csv
|   |-- auditoria.csv
|   `-- scrape_execucoes.log
|-- public/
|   |-- index.html
|   |-- script.js
|   `-- style.css
|-- src/
|   |-- app.js
|   |-- controllers/
|   |   `-- eventController.js
|   `-- services/
|       |-- databaseService.js
|       |-- scraperService.js
|       `-- webScraperService.js
`-- package.json
```

## Requisitos

- Node.js 18+ (recomendado LTS)
- npm
- Chrome/Chromium para Puppeteer

Se o Puppeteer reclamar que nao encontrou Chrome:

```bash
npx puppeteer browsers install chrome
```

## Como Rodar

Na raiz do projeto:

```bash
npm install
node src/app.js
```

Depois acesse:

```text
http://localhost:3000
```

## Endpoints

- `GET /api/events`
  - retorna lista de eventos do CSV

- `POST /api/scrape`
  - executa sincronizacao completa
  - retorna lista atualizada

- `POST /api/events/:id/toggle-save`
  - alterna flag `saved` do evento

## Observacoes de Execucao

- `package.json` nao possui script `start` no momento.
- Por isso, o comando correto e `node src/app.js`.
- O projeto usa CSV local como base de dados.
