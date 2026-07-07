import { createApp } from 'vue';
import Varlet, { Input } from '@varlet/ui';
import '@varlet/ui/es/style';
import './style.css';
import App from './App.vue';
import router from './router';

createApp(App).use(Varlet).use(router).mount('#app');
