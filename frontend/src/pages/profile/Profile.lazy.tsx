import React from 'react';
import { lazy } from "react";

export const LazyProfile = lazy( () => import('./Profile'))