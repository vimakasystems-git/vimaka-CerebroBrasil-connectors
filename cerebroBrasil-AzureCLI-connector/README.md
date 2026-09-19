# cerebroBrasil-AzureCLI-connector

Conector do ecossistema CerebroBrasil/Vimaka para preparar uma máquina Linux e autenticar o usuário no Azure CLI.

## Objetivo

Este conector fornece uma camada simples para:

- instalar o Azure CLI usando o repositório oficial da Microsoft;
- executar autenticação interativa com `az login`;
- consultar a conta/subscription ativa;
- configurar a identidade Git da Vimaka;
- servir como base para integração futura com o CerebroBrasil.

## Segurança

Nenhuma senha, token, client secret ou chave de API é armazenada neste repositório.

A autenticação é delegada ao Azure CLI oficial.

## Instalação rápida

```bash
chmod +x install.sh cerebrobrasil-azure
sudo ./install.sh
./cerebrobrasil-azure login
./cerebrobrasil-azure status
```

## Git

Identidade padrão:

```text
Vimaka Systems <vimakasystems@gmail.com>
```

Para configurar:

```bash
./cerebrobrasil-azure git-setup
```

## Site

https://cerebrobrasil.com.br
