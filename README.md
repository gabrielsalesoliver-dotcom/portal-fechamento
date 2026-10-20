# Portal de Fechamento GSM

Site estático do portal de fechamento de última milha (GSM Log). Os dados ficam no Supabase, protegidos por login e regras de acesso por perfil; este repositório guarda só o código das telas.

- `index.html`, `style.css`: página e visual padrão GSM
- `app.js`: telas (administração e área do parceiro)
- `parse.js`: leitura dos arquivos (Umov, inclusão e cancelamento, aba Atendimentos)
- `modelo.js`: geração do modelo GSM do relatório do parceiro
