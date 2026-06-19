import { PartyBoxApp } from "./app.js";

const bootstrap = () => {
  window.app = new PartyBoxApp();
};

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', bootstrap);
} else {
  bootstrap();
}
