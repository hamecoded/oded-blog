import type { Api } from '../types';
import { createLocalApi } from './local';
import { createSupabaseApi } from './supabase';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** Supabase when configured, otherwise a self-contained in-browser demo. */
export const api: Api = url && key ? createSupabaseApi(url, key) : createLocalApi();
