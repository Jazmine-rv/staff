// frontend/js/auth.js
import { supabase } from './supabaseClient.js';

// ---------- LOGIN ----------
export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

// ---------- LOGOUT ----------
export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

// ---------- SESIÓN ACTUAL ----------
export async function getSession() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session;
}

// ---------- PERFIL DEL STAFF (staff_profiles) ----------
export async function getStaffProfile() {
  const session = await getSession();
  if (!session) return null;
  const { data, error } = await supabase
    .from('staff_profiles')
    .select('display_name, role')
    .eq('auth_user_id', session.user.id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// ---------- PROTECCIÓN ----------
// En el login: si ya hay sesión, manda al dashboard.
export async function redirectIfLoggedIn() {
  const session = await getSession();
  if (session) window.location.href = './dashboard.html';
}

// En páginas privadas: si no hay sesión, manda al login.
export async function requireAuth() {
  const session = await getSession();
  if (!session) {
    window.location.href = './index.html';
    return null;
  }
  return session;
}