import type { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', loadComponent: () => import('./pages/home/home').then((m) => m.Home), title: 'Prismatic Showdown' },
  { path: 'room/:code', loadComponent: () => import('./pages/room/room').then((m) => m.RoomPage), title: 'Prismatic Showdown' },
  { path: '**', redirectTo: '' },
];
