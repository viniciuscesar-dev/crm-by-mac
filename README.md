CRM by Mac

Gestão inteligente de clientes, propostas e operações comerciais.

O CRM by Mac é um sistema de gestão comercial desenvolvido para centralizar o relacionamento com clientes, organizar processos de atendimento, acompanhar oportunidades de vendas e facilitar a elaboração de propostas de revisão contratual.

O projeto nasceu da necessidade de transformar processos comerciais manuais em uma operação mais organizada, eficiente e orientada por dados.

Seu objetivo é oferecer uma plataforma completa, com interface intuitiva, controle de acesso e ferramentas que auxiliem consultores e administradores na gestão de suas atividades.

⸻

Sobre o projeto

O CRM by Mac foi idealizado para atender empresas que trabalham com consultoria e análise de contratos financeiros.

A plataforma busca reunir, em um único ambiente, recursos para:

* Gerenciamento de clientes e leads.
* Organização de oportunidades comerciais.
* Acompanhamento de negociações.
* Elaboração de propostas personalizadas.
* Controle de metas e resultados.
* Gestão de consultores.
* Monitoramento de atividades comerciais.
* Integração com serviços externos.

O sistema foi planejado para funcionar em computadores e dispositivos móveis.

⸻

Principais funcionalidades

1. Dashboard comercial

Painel de acompanhamento dos principais indicadores da operação.

Recursos previstos:

* Visão geral de leads e oportunidades.
* Monitoramento de vendas.
* Acompanhamento de metas individuais e coletivas.
* Indicadores de conversão.
* Relatórios por consultor.
* Análise de desempenho comercial.

2. Gestão de leads

Módulo destinado à organização da base de clientes.

Recursos previstos:

* Cadastro e atualização de contatos.
* Registro do histórico de atendimento.
* Classificação de leads por status.
* Distribuição de clientes entre consultores.
* Acompanhamento das etapas de negociação.
* Organização de retornos e atividades.

3. Propostas de revisão contratual

Um dos módulos centrais do CRM by Mac.

O sistema foi projetado para permitir a criação de propostas personalizadas para diferentes modalidades contratuais.

Modalidades contempladas no planejamento:

* Financiamento de veículos.
* Financiamento imobiliário.
* Empréstimos.
* Quitação contratual.

As propostas podem apresentar informações como:

* Dados do cliente.
* Instituição financeira.
* Condições contratuais.
* Valores atuais e revisados.
* Comparativos financeiros.
* Economia estimada.
* Informações técnicas e jurídicas.
* Status da proposta.

O objetivo é apresentar informações de maneira clara e acessível, sem substituir a análise técnica ou jurídica necessária em cada caso.

4. Gestão de usuários

Estrutura de acesso baseada em diferentes perfis.

Administrador

* Gerenciamento da operação.
* Controle de usuários.
* Acompanhamento de resultados.
* Configurações gerais do sistema.

Consultor

* Acompanhamento de seus clientes.
* Gestão de oportunidades.
* Elaboração e acompanhamento de propostas.
* Consulta de indicadores individuais.

O projeto também contempla mecanismos de autenticação e controle de permissões.

5. Campanhas e automações

O planejamento do CRM inclui ferramentas para apoiar a comunicação comercial.

Recursos em desenvolvimento ou integração:

* Organização de campanhas.
* Segmentação de contatos.
* Registro de interações.
* Acompanhamento de resultados.
* Integração com a API oficial do WhatsApp Business.

As funcionalidades de comunicação dependem das configurações e autorizações exigidas pelos serviços utilizados.

6. Segurança e rastreabilidade

A arquitetura do projeto considera:

* Autenticação de usuários.
* Controle de acesso por perfil.
* Gerenciamento de sessões.
* Registro de atividades.
* Proteção de credenciais.
* Armazenamento estruturado de dados.
* Boas práticas de privacidade e proteção de informações.
A validação desses mecanismos faz parte das etapas necessárias antes da utilização em produção.

⸻

Tecnologias utilizadas

O projeto utiliza tecnologias voltadas ao desenvolvimento web e à infraestrutura em nuvem.

Tecnologia	Aplicação
JavaScript	Desenvolvimento das funcionalidades
HTML5	Estrutura das interfaces
CSS3	Estilização e responsividade
Node.js	Ferramentas e ambiente de desenvolvimento
PostgreSQL	Banco de dados relacional
Neon	Hospedagem e gerenciamento do banco de dados
Cloudflare Workers	Execução de serviços e APIs
Git	Controle de versões
GitHub	Armazenamento e versionamento do código

A estrutura do repositório também contém componentes relacionados ao Netlify, utilizados em etapas anteriores do desenvolvimento.

⸻

Estrutura do projeto

A organização principal do código inclui:

CRM_BY_MAC/
│
├── assets/
│
├── DIAGNOSTICO/
│
├── netlify/
│   └── functions/
│
├── public/
│   ├── assets/
│   └── index.html
│
├── worker/
│   └── index.mjs
│
├── .gitignore
├── index.html
├── package.json
├── wrangler.jsonc
│
└── README.md

Descrição dos diretórios:

* assets/: arquivos e recursos visuais.
* DIAGNOSTICO/: materiais de diagnóstico e validação.
* netlify/functions/: funções de backend da arquitetura anterior.
* public/: arquivos da interface web.
* worker/: implementação destinada ao Cloudflare Workers.
* package.json: configurações e dependências do projeto.
* wrangler.jsonc: configurações de implantação no Cloudflare.

⸻

Banco de dados

O CRM by Mac utiliza PostgreSQL, com infraestrutura hospedada no Neon.

O banco de dados foi estruturado para armazenar informações relacionadas a usuários, sessões, clientes, oportunidades, propostas, campanhas e atividades comerciais.

O projeto inclui scripts SQL para criação e evolução das estruturas necessárias.

Atenção: a existência das tabelas não significa, por si só, que todos os fluxos do sistema estejam validados.

⸻

Status do desenvolvimento

Projeto em desenvolvimento e validação técnica.

