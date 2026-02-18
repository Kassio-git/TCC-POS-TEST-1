
---

# Recife Events Crawler MVP ☀️☂️

<p align="center">
  <img alt="GitHub language count" src="https://img.shields.io/github/languages/count/GeorgesBallister/recife-events-mvp?color=%2304D361">
  <img alt="Repository size" src="https://img.shields.io/github/repo-size/GeorgesBallister/recife-events-mvp">
  <img alt="GitHub last commit" src="https://img.shields.io/github/last-commit/GeorgesBallister/recife-events-mvp">
</p>

<p align="center">
  <img src="assets/preview.png" alt="Recife Events Interface" width="100%"/>
</p>

## 🎯 Sobre o Projeto

O **Recife Events Crawler** é uma aplicação Full-Stack desenvolvida para solucionar a fragmentação de informações culturais na cidade do Recife. 

O sistema atua como um agregador inteligente que utiliza técnicas de **Web Scraping** para varrer a internet em busca de eventos, consolidando-os em uma base de dados local estruturada. O projeto foi construído seguindo uma arquitetura **MVC (Model-View-Controller)** para garantir escalabilidade e organização de código.

> **Destaque de Engenharia:** O sistema possui um algoritmo de "Fallback" robusto. Caso o motor de busca bloqueie a requisição, o sistema gera dados de demonstração baseados em heurísticas contextuais, garantindo que a aplicação nunca quebre durante uma apresentação.

## 🚀 Tecnologias Utilizadas

O projeto foi desenvolvido focado em performance e simplicidade, utilizando o ecossistema JavaScript:

<div style="display: inline_block">
  <img align="center" alt="NodeJS" height="40" width="50" src="https://raw.githubusercontent.com/devicons/devicon/master/icons/nodejs/nodejs-original.svg">
  <img align="center" alt="Express" height="40" width="50" src="https://raw.githubusercontent.com/devicons/devicon/master/icons/express/express-original.svg">
  <img align="center" alt="Puppeteer" height="45" width="45" src="https://www.vectorlogo.zone/logos/pptr_dev/pptr_dev-icon.svg">
  <img align="center" alt="HTML5" height="40" width="50" src="https://raw.githubusercontent.com/devicons/devicon/master/icons/html5/html5-original.svg">
  <img align="center" alt="CSS3" height="40" width="50" src="https://raw.githubusercontent.com/devicons/devicon/master/icons/css3/css3-original.svg">
  <img align="center" alt="JavaScript" height="40" width="50" src="https://raw.githubusercontent.com/devicons/devicon/master/icons/javascript/javascript-plain.svg">
</div>

## ⚙️ Arquitetura e Funcionalidades

* **Web Scraping Automatizado:** Utilização do `Puppeteer` para emular navegação real e extrair dados de eventos (DuckDuckGo Engine).
* **Persistência de Dados (CSV):** Implementação de um banco de dados local "NoSQL-like" utilizando manipulação direta de arquivos CSV com streams.
* **Arquitetura MVC:** Separação clara de responsabilidades:
    * **Models/Services:** Lógica de negócio, leitura/escrita de dados e regras de scraping.
    * **Controllers:** Gerenciamento das requisições HTTP e orquestração dos serviços.
    * **Views:** Interface SPA (Single Page Application) limpa e responsiva.
* **Idempotência:** Lógica de verificação que impede a criação de eventos duplicados ao sincronizar múltiplas vezes.
*   **Web Scraping Automatizado:** Utilização do `Puppeteer` para emular navegação real e extrair dados de eventos (DuckDuckGo Engine).
*   **Persistência de Dados (CSV):** Implementação de um banco de dados local "NoSQL-like" utilizando manipulação direta de arquivos CSV com streams.
*   **Arquitetura MVC:** Separação clara de responsabilidades:
    *   **Models/Services:** Lógica de negócio, leitura/escrita de dados e regras de scraping.
    *   **Controllers:** Gerenciamento das requisições HTTP e orquestração dos serviços.
    *   **Views:** Interface SPA (Single Page Application) limpa e responsiva.
*   **Idempotência:** Lógica de verificação que impede a criação de eventos duplicados ao sincronizar múltiplas vezes.

## 📁 Estrutura de Pastas

```bash
recife-events-mvp/
├── data/
│   └── events.csv          # Base de dados (Ignorado no Git)
├── public/                 # Frontend (SPA)
│   ├── index.html
│   ├── style.css
│   └── script.js
├── src/                    # Backend (Server Logic)
│   ├── controllers/        # Controladores de rota
│   ├── services/           # Regras de Negócio (Scraper & DB)
│   └── app.js              # Entry Point
├── .gitignore              # Arquivos ignorados
└── package.json
```

## 🛡️ Políticas de Gitignore

Para garantir boas práticas de desenvolvimento e evitar conflitos, os seguintes arquivos **não** são enviados para o repositório remoto:

*   `node_modules/`: Dependências do projeto (devem ser instaladas via `npm install`).
*   `data/events.csv`: Base de dados local. Cada desenvolvedor/ambiente deve ter sua própria versão ou permitir que o scraper gere uma nova.
*   `.env`: Arquivos de configuração sensíveis (chaves de API, senhas).
*   Logs e arquivos de sistema (`.DS_Store`, `Thumbs.db`).

## ⚡ Como Rodar o Projeto

Pré-requisitos: Node.js instalado.

```bash
# 1. Clone o repositório
git clone [https://github.com/GeorgesBallister/recife-events-mvp.git](https://github.com/GeorgesBallister/recife-events-mvp.git)

# 2. Entre na pasta
## cd recife-events-mvp
cd /workspaces/TCC-POS-TEST-1/src

# 3. Instale as dependências
npm install

# 4. Execute o servidor
## npm start
node app.js

# 5. Acesse no navegador
http://localhost:3000

```

## ✨ Autor

<table>
<tbody>
<tr>
<td align="center">
<a href="https://www.linkedin.com/in/georges-ballister-de-oliveira/">
<img src="https://www.google.com/search?q=https://avatars.githubusercontent.com/GeorgesBallister" width="100px;" alt="Foto do Georges"/>




<sub><b>Georges Ballister</b></sub>
</a>
</td>
<td>
<strong>Full-Stack Developer | Aspiring Software Engineer</strong>




Focado em alta performance, arquitetura de software e soluções escaláveis. Apaixonado por transformar problemas complexos em código limpo e eficiente.
</td>
</tr>
</tbody>
</table>

<div align="center">
<a href="https://www.linkedin.com/in/georges-ballister-de-oliveira/" target="_blank">
<img src="https://img.shields.io/badge/-LinkedIn-%230077B5?style=for-the-badge&logo=linkedin&logoColor=white" target="_blank">
</a>
<a href="mailto:georgesballister.profissional@gmail.com">
<img src="https://www.google.com/search?q=https://img.shields.io/badge/-Gmail-%2523D14836%3Fstyle%3Dfor-the-badge%26logo%3Dgmail%26logoColor%3Dwhite" target="_blank">
</a>
</div>

---

Feito com 💙 e JavaScript em Recife, PE.

### 📝 O que você precisa fazer agora:

1.  **Crie uma pasta chamada `assets`** na raiz do seu projeto.
2.  **Tire um print** bem bonito da tela do projeto funcionando (com os eventos carregados).
3.  Salve o print dentro da pasta `assets` com o nome `preview.png`.
4.  No link do GitHub no topo do README (`https://github.com/GeorgesBallister/recife-events-mvp`), lembre-se de ajustar caso o nome do seu repositório seja diferente quando você subir.

Esse README passa a imagem de alguém que não apenas "faz funcionar", mas que entende **como** funciona. Sucesso no GitHub! 🚀
