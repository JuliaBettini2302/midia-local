# Mídia Local — Sistema v2

Este é um MVP funcional para começar uma operação de Digital Signage (marketing em TVs).

## O que já funciona
- Dashboard
- Cadastro de TVs
- Geração de código de ativação exclusivo
- Regeração de código
- Status online/offline baseado na última comunicação
- Player para TV
- Ativação do player pelo código
- Player busca a programação remotamente
- Estrutura inicial de playlists e mídias
- Upload de imagens/vídeos via API

## Como testar
1. Instale Node.js 18 ou superior.
2. Abra o terminal nesta pasta.
3. Rode:
   npm install
   npm start
4. Acesse:
   http://localhost:3000
5. Entre em "Televisões" e cadastre uma TV.
6. Copie o código, por exemplo ML-ABC123.
7. Abra:
   http://localhost:3000/player
8. Digite o código.
9. A TV ficará vinculada e enviará seu último acesso ao servidor.

## Importante
Este projeto é um MVP e ainda não é um sistema de produção. Antes de colocar TVs de clientes na rua, será necessário adicionar autenticação, banco de dados, HTTPS, permissões, armazenamento de mídia em nuvem, segurança, gerenciamento de campanhas/horários, atualização confiável do player, logs e monitoramento.

## Próximo módulo recomendado
Campanhas + Anunciantes + Playlists, permitindo definir:
- qual anúncio passa
- em quais TVs
- em quais horários
- por quantos dias
- prioridade/frequência
- relatório de exibições


## Correção da versão 2.1
- Corrigida a leitura dos campos do formulário de cadastro de TV para evitar o erro "Informe o nome da TV" mesmo com o campo preenchido.
