# ReservaLab

Sistema de agendamento do laboratório de informática, dos data shows, da sala de inovação e da sala Google da escola.
Projeto Integrador.

## Como o sistema funciona

```
 Navegador do professor
 (index.html + style.css + script.js)
        │   hospedado no GitHub Pages
        │
        ├──► Firebase Authentication ── login com conta Google
        │
        └──► Cloud Firestore ────────── banco de dados (reservas e ocorrências)
                    ▲
                    └── firestore.rules: regras de segurança
```

| Arquivo | Para que serve |
|---|---|
| `index.html` | Estrutura da página: cabeçalho, abas, grade, formulários e janelas |
| `style.css` | Visual: cores, fontes, layout, versão para celular e modo escuro |
| `script.js` | Lógica: login, agenda, reservas, ocorrências, relatório, conexão com o banco |
| `firebase-config.js` | Endereço do projeto Firebase e e-mails da coordenação |
| `firestore.rules` | Regras de segurança do banco (fica no Firebase, não no site) |

### Como o banco está organizado

**Coleção `reservas`:** cada documento é um horário reservado. O nome do documento é `recurso_data_aula`, por exemplo `lab_2026-10-22_3`. Como o banco não aceita dois documentos com o mesmo nome, **é impossível existir duas reservas no mesmo horário**.

| Campo | Exemplo |
|---|---|
| recurso | `lab` |
| data | `2026-10-22` |
| aula | `3` |
| professor | `Miguel` |
| turma | `3º ano` |
| disciplina | `Projeto Integrador` |
| finalidade | `Desenvolvimento do aplicativo` |
| tipo | `aula` ou `bloqueio` |
| criadoPor | código da conta Google de quem reservou |
| criadoEm | data e hora da reserva |

**Coleção `ocorrencias`:** cada documento é um problema relatado (recurso, descrição, autor, se já foi resolvido).

### O que as regras de segurança garantem

- Só quem entrou com conta Google vê e usa o sistema.
- Ninguém reserva um horário que já está ocupado.
- Só quem fez a reserva, ou a coordenação, pode cancelá-la.
- Só a coordenação pode bloquear horários.
- Ninguém consegue mudar o texto de uma ocorrência de outra pessoa.

---

## Passo a passo para colocar no ar

Você vai precisar de uma conta Google e de uma conta no GitHub (as duas são gratuitas). Os nomes dos botões podem variar um pouco conforme o idioma da tela.

### Parte 1: Criar o banco de dados no Firebase

**1. Criar o projeto**
1. Acesse **console.firebase.google.com** e entre com sua conta Google.
2. Clique em **Criar um projeto** (ou "Adicionar projeto").
3. Dê o nome `reservalab` e avance.
4. O Google Analytics não é necessário: pode desativar.
5. Clique em **Criar projeto** e espere terminar.

**2. Registrar o site no projeto**
1. Na página inicial do projeto, clique no ícone **`</>`** (Web).
2. Apelido do app: `ReservaLab`. Não marque "Firebase Hosting".
3. Clique em **Registrar app**.
4. Vai aparecer um bloco de código com `const firebaseConfig = { ... }`.
5. Copie os valores (`apiKey`, `authDomain`, `projectId`, `storageBucket`, `messagingSenderId`, `appId`) para o arquivo **`firebase-config.js`**, no lugar de cada `COLE_AQUI`.

**3. Ativar o login com Google**
1. No menu lateral, abra **Criação > Authentication** e clique em **Vamos começar**.
2. Na aba **Método de login**, escolha **Google**.
3. Ative a chave, escolha o e-mail de suporte e clique em **Salvar**.

**4. Criar o banco de dados**
1. No menu lateral, abra **Criação > Firestore Database**.
2. Clique em **Criar banco de dados**.
3. Local: escolha **southamerica-east1 (São Paulo)**, que é o mais perto do Ceará.
4. Escolha **Iniciar no modo de produção** e clique em **Criar**.

**5. Colar as regras de segurança**
1. Ainda no Firestore, abra a aba **Regras**.
2. Apague tudo que estiver lá e cole o conteúdo do arquivo **`firestore.rules`**.
3. Na função `isAdmin()`, troque `seu-email@gmail.com` pelo e-mail da coordenação (pode colocar vários, separados por vírgula).
4. Clique em **Publicar**.

**6. Definir a coordenação no site**
No arquivo **`firebase-config.js`**, troque `seu-email@gmail.com` em `ADMINS` pelos **mesmos** e-mails do passo anterior.

### Parte 2: Publicar o site no GitHub

**7. Criar o repositório**
1. Entre no **github.com** e clique em **New repository** (botão verde ou o **+** no topo).
2. Nome: `reservalab`. Deixe como **Public**.
3. Clique em **Create repository**.

**8. Enviar os arquivos**
1. Na página do repositório, clique em **uploading an existing file**.
2. Arraste os arquivos: `index.html`, `style.css`, `script.js`, `firebase-config.js`, `firestore.rules` e `README.md`.
3. Clique em **Commit changes**.

**9. Ativar o GitHub Pages**
1. No repositório, abra **Settings > Pages**.
2. Em **Source**, escolha **Deploy from a branch**.
3. Em **Branch**, escolha **main** e a pasta **/ (root)**. Clique em **Save**.
4. Espere 1 a 2 minutos e recarregue a página. O endereço vai aparecer no topo, assim: `https://SEU-USUARIO.github.io/reservalab/`

**10. Autorizar o endereço do GitHub no Firebase**
Sem este passo, o login com Google não funciona.
1. No Firebase, abra **Authentication > Configurações > Domínios autorizados**.
2. Clique em **Adicionar domínio** e digite `SEU-USUARIO.github.io` (sem `https://` e sem `/reservalab`).
3. Salve.

### Parte 3: Testar

1. Abra o endereço do GitHub Pages.
2. Clique em **Entrar com Google**.
3. Faça uma reserva e confira no Firebase, em **Firestore Database > Dados**: a reserva aparece lá na hora. Esse é um ótimo momento para mostrar na apresentação.
4. Abra o site em outro navegador ou celular, com outra conta, e veja a mesma reserva aparecer.

---

## Dúvidas comuns

**A página mostra "Falta conectar o banco de dados".**
O `firebase-config.js` ainda tem algum `COLE_AQUI`. Confira se colou todos os valores e enviou o arquivo atualizado para o GitHub.

**Ao entrar aparece "Este endereço ainda não foi autorizado".**
Faltou o passo 10.

**Aparece "Sua conta não tem permissão".**
As regras do passo 5 não foram publicadas, ou foram configuradas para aceitar só e-mails da escola e a conta usada é de outro domínio.

**Quero testar no meu computador antes de publicar.**
Abrir o `index.html` com dois cliques não funciona, porque o navegador bloqueia módulos JavaScript abertos direto do disco. Use a extensão **Live Server** do VS Code (botão "Go Live").

**Quero liberar só os e-mails da escola.**
No `firestore.rules`, na função `podeUsar()`, siga a instrução do comentário e troque o domínio pelo da escola.

**Quero mudar os horários ou os recursos.**
No início do `script.js`, edite as listas `AULAS` e `RECURSOS`. Se mudar a quantidade de aulas ou os códigos dos recursos, atualize também o `firestore.rules` (a lista de recursos e o `aula <= 8`) e publique as regras de novo.

**Quanto custa?**
Nada. O GitHub Pages é gratuito, e o plano gratuito do Firebase (Spark) tem limites diários de leituras e gravações que sobram para o uso de uma escola.
