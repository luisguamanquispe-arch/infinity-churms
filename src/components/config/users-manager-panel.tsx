"use client";

import { useEffect, useState } from "react";
import { COLORS, ROLE_LABELS } from "@/lib/constants";

interface ManagedUser {
  id: string;
  name: string;
  email: string;
  role: string;
  active: boolean;
  createdAt: string;
}

const ROLE_OPTIONS = [
  { value: "COBRANZAS", label: "Agente de cobranza" },
  { value: "ADMIN", label: "Administrador" },
  { value: "SUPERVISOR", label: "Supervisor" },
  { value: "TECNICO", label: "Técnico" },
] as const;

const emptyCreate = {
  name: "",
  email: "",
  password: "",
  role: "COBRANZAS",
};

export function UsersManagerPanel() {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [currentUserId, setCurrentUserId] = useState("");
  const [createForm, setCreateForm] = useState(emptyCreate);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    name: "",
    email: "",
    role: "COBRANZAS",
    active: true,
    password: "",
  });
  const [msg, setMsg] = useState("");
  const [saving, setSaving] = useState(false);

  async function loadUsers() {
    const [usersRes, meRes] = await Promise.all([
      fetch("/api/users"),
      fetch("/api/auth/me"),
    ]);
    if (usersRes.ok) setUsers(await usersRes.json());
    if (meRes.ok) {
      const me = await meRes.json();
      setCurrentUserId(me.userId ?? "");
    }
  }

  useEffect(() => {
    loadUsers();
  }, []);

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMsg("");
    const res = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(createForm),
    });
    const json = await res.json();
    if (!res.ok) {
      setMsg(json.error ?? "Error al crear usuario");
      setSaving(false);
      return;
    }
    setCreateForm(emptyCreate);
    setMsg(`Agente creado: ${json.name} — puede iniciar sesión con su usuario y clave`);
    await loadUsers();
    setSaving(false);
  }

  function startEdit(user: ManagedUser) {
    setEditingId(user.id);
    setEditForm({
      name: user.name,
      email: user.email,
      role: user.role,
      active: user.active,
      password: "",
    });
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingId) return;
    setSaving(true);
    setMsg("");
    const res = await fetch(`/api/users/${editingId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: editForm.name,
        email: editForm.email,
        role: editForm.role,
        active: editForm.active,
        password: editForm.password || undefined,
      }),
    });
    const json = await res.json();
    if (!res.ok) {
      setMsg(json.error ?? "Error al actualizar");
      setSaving(false);
      return;
    }
    setEditingId(null);
    setMsg("Usuario actualizado");
    await loadUsers();
    setSaving(false);
  }

  const collectionAgents = users.filter(
    (u) => u.active && (u.role === "COBRANZAS" || u.role === "ADMIN")
  );

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-teal-100 bg-teal-50/50 p-4 text-sm text-teal-900">
        <p className="font-semibold">Agentes para etapas de cobro</p>
        <p className="mt-1">
          Cree usuarios con rol <strong>Agente de cobranza</strong>. Cada uno ingresa con su{" "}
          <strong>usuario (correo)</strong> y <strong>clave</strong>. Al registrar gestiones, el
          agente seleccionado queda en el historial por etapas del cliente.
        </p>
        <p className="mt-2 text-xs">
          Agentes activos disponibles en cobranza:{" "}
          <strong>{collectionAgents.length}</strong>
          {collectionAgents.length > 0 &&
            ` — ${collectionAgents.map((u) => u.name).join(", ")}`}
        </p>
      </section>

      {msg && <p className="rounded-lg bg-teal-50 px-4 py-2 text-sm text-teal-800">{msg}</p>}

      <section className="rounded-xl border bg-white p-5 shadow-sm">
        <h2 className="font-semibold text-[#0B1F3A]">Nuevo usuario / agente</h2>
        <form onSubmit={createUser} className="mt-4 grid gap-3 sm:grid-cols-2">
          <Field label="Nombre completo *">
            <input
              required
              value={createForm.name}
              onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
              className="w-full rounded border px-2 py-1.5 text-sm"
              placeholder="Ej. María López"
            />
          </Field>
          <Field label="Usuario (correo) *">
            <input
              required
              type="email"
              value={createForm.email}
              onChange={(e) => setCreateForm({ ...createForm, email: e.target.value.toLowerCase() })}
              className="w-full rounded border px-2 py-1.5 text-sm"
              placeholder="agente@infinity.net"
            />
          </Field>
          <Field label="Clave *">
            <input
              required
              type="password"
              minLength={6}
              value={createForm.password}
              onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
              className="w-full rounded border px-2 py-1.5 text-sm"
              placeholder="Mínimo 6 caracteres"
            />
          </Field>
          <Field label="Rol *">
            <select
              value={createForm.role}
              onChange={(e) => setCreateForm({ ...createForm, role: e.target.value })}
              className="w-full rounded border px-2 py-1.5 text-sm"
            >
              {ROLE_OPTIONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </Field>
          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              style={{ backgroundColor: COLORS.brand }}
            >
              {saving ? "Creando…" : "Crear usuario"}
            </button>
          </div>
        </form>
      </section>

      {editingId && (
        <section className="rounded-xl border-2 border-teal-200 bg-white p-5 shadow-sm">
          <h2 className="font-semibold text-[#0B1F3A]">Editar usuario</h2>
          <form onSubmit={saveEdit} className="mt-4 grid gap-3 sm:grid-cols-2">
            <Field label="Nombre *">
              <input
                required
                value={editForm.name}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                className="w-full rounded border px-2 py-1.5 text-sm"
              />
            </Field>
            <Field label="Usuario (correo) *">
              <input
                required
                type="email"
                value={editForm.email}
                onChange={(e) => setEditForm({ ...editForm, email: e.target.value.toLowerCase() })}
                className="w-full rounded border px-2 py-1.5 text-sm"
              />
            </Field>
            <Field label="Nueva clave (opcional)">
              <input
                type="password"
                minLength={6}
                value={editForm.password}
                onChange={(e) => setEditForm({ ...editForm, password: e.target.value })}
                className="w-full rounded border px-2 py-1.5 text-sm"
                placeholder="Dejar vacío para no cambiar"
              />
            </Field>
            <Field label="Rol *">
              <select
                value={editForm.role}
                onChange={(e) => setEditForm({ ...editForm, role: e.target.value })}
                className="w-full rounded border px-2 py-1.5 text-sm"
                disabled={editingId === currentUserId}
              >
                {ROLE_OPTIONS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </Field>
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input
                type="checkbox"
                checked={editForm.active}
                onChange={(e) => setEditForm({ ...editForm, active: e.target.checked })}
                disabled={editingId === currentUserId}
              />
              Usuario activo (puede iniciar sesión y ser agente de cobro)
            </label>
            <div className="flex gap-2 sm:col-span-2">
              <button
                type="submit"
                disabled={saving}
                className="rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                style={{ backgroundColor: COLORS.brand }}
              >
                Guardar cambios
              </button>
              <button
                type="button"
                onClick={() => setEditingId(null)}
                className="rounded-lg border px-4 py-2 text-sm"
              >
                Cancelar
              </button>
            </div>
          </form>
        </section>
      )}

      <section className="rounded-xl border bg-white p-5 shadow-sm">
        <h2 className="font-semibold text-[#0B1F3A]">Usuarios del sistema</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left">
              <tr>
                <th className="px-3 py-2">Nombre</th>
                <th className="px-3 py-2">Usuario</th>
                <th className="px-3 py-2">Rol</th>
                <th className="px-3 py-2">Estado</th>
                <th className="px-3 py-2">Alta</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id} className="border-t">
                  <td className="px-3 py-2 font-medium">{user.name}</td>
                  <td className="px-3 py-2">{user.email}</td>
                  <td className="px-3 py-2">
                    {ROLE_LABELS[user.role] ?? user.role}
                    {user.role === "COBRANZAS" && (
                      <span className="ml-1 text-xs text-teal-700">· agente</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {user.active ? (
                      <span className="text-teal-700">Activo</span>
                    ) : (
                      <span className="text-slate-400">Inactivo</span>
                    )}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-slate-600">
                    {new Date(user.createdAt).toLocaleDateString("es-VE")}
                  </td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      onClick={() => startEdit(user)}
                      className="text-xs text-teal-700 hover:underline"
                    >
                      Editar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs text-slate-600">{label}</label>
      <div className="mt-1">{children}</div>
    </div>
  );
}
