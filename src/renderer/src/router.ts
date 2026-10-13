import { createRouter, createWebHashHistory } from 'vue-router'

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', component: () => import('./views/Dashboard.vue') },
    { path: '/records', component: () => import('./views/RecordsView.vue') },
    { path: '/notes', component: () => import('./views/NotesView.vue') },
    { path: '/goals', component: () => import('./views/GoalsView.vue') },
    { path: '/checkin', component: () => import('./views/CheckinView.vue') },
    { path: '/routes', component: () => import('./views/RoutesView.vue') },
    { path: '/library', component: () => import('./views/LibraryView.vue') },
    { path: '/projects', component: () => import('./views/ProjectsView.vue') },
    { path: '/wishlist', component: () => import('./views/WishlistView.vue') },
    { path: '/reflections', component: () => import('./views/ReflectionsView.vue') },
    { path: '/reports', component: () => import('./views/ReportsView.vue') },
    { path: '/settings', component: () => import('./views/SettingsView.vue') }
  ]
})
