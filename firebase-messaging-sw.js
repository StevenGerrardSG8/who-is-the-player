// Lets Firebase Cloud Messaging deliver a notification while this site's
// tab isn't open. Must live at the site root (not under src/ or public/)
// so its default registration scope covers the whole app.
importScripts("https://www.gstatic.com/firebasejs/10.13.2/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.13.2/firebase-messaging-compat.js");

firebase.initializeApp({
  projectId: "who-is-the-player-wtp",
  appId: "1:470732728070:web:39c75dd8d38c8523a42087",
  messagingSenderId: "470732728070",
  apiKey: "AIzaSyCkt50JG1slwcgnxDCliYoFrDAUNpa5wkQ",
});

firebase.messaging();
