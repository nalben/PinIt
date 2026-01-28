import React from 'react';
import { lazy } from "react";

export const LazyTodo = lazy( () => import('./Todo'))
