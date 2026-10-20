/* =====================================================================
   ReservaLab — configuração do Firebase
   ---------------------------------------------------------------------
   1) No console do Firebase, abra: Configurações do projeto (engrenagem)
      > Geral > Seus apps > app da Web (</>) > "Configuração do SDK".
   2) Copie os valores e cole abaixo, no lugar de "COLE_AQUI".

   Pode deixar este arquivo público no GitHub: essas chaves só identificam
   o projeto. Quem protege os dados são as regras do arquivo firestore.rules.
   ===================================================================== */
export const firebaseConfig = {
  apiKey: "AIzaSyBvOloe-Oo-ntN1dK-FS0S7JO3TaN24d4w",
  authDomain: "reservalab-1c715.firebaseapp.com",
  projectId: "reservalab-1c715",
  storageBucket: "reservalab-1c715.firebasestorage.app",
  messagingSenderId: "96732231378",
  appId: "1:96732231378:web:be093c5d0568ae6e819f0b",
};

/* E-mails da coordenação: podem bloquear horários e cancelar qualquer reserva.
   Coloque os MESMOS e-mails na função isAdmin() do arquivo firestore.rules,
   sempre em letras minúsculas. */
export const ADMINS = [
  "miguelnetoo76@gmail.com",
];
