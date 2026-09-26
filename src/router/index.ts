import { createRouter, createWebHistory } from 'vue-router';
import HomeView from '../views/HomeView.vue';

const router = createRouter({
  history: createWebHistory('/tr'),
  routes: [
    {
      path: '/',
      name: 'home',
      component: HomeView,
    },
    {
      path: '/display',
      name: 'display',
      component: () => import('../views/display/index.vue'),
    },
  ],
});

export default router;
