import { configureLegacyLayout } from '../services/compatibility';
import { mount, unmount } from 'svelte';
import App from './App.svelte';
import './app.css';

configureLegacyLayout(document);
const app = mount(App, { target: document.getElementById('root')! });
if (import.meta.hot)
  import.meta.hot.dispose(() => {
    void unmount(app);
  });
