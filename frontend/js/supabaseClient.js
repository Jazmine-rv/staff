// frontend/js/supabaseClient.js
// URL y anon key del proyecto Supabase. La anon key es PÚBLICA por diseño;
// la seguridad real la aplica RLS en la base de datos.
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

export const SUPABASE_URL = 'https://pnyqgvnofgwfmuyqglsu.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_jL2gN26vukmtZ_najZvzUg_IpwGwRHH';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);