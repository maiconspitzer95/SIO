import { createContext, useContext, useEffect, useState } from "react";
import { api } from "../services/api.js";
const Context = createContext(null);
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    api("/auth/me")
      .then((data) => {
        if (active) setUser(data.user);
      })
      .catch((e) => {
        if (active && e.status !== 401) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    const expired = () => setUser(null);
    window.addEventListener("sio:expired", expired);
    return () => {
      active = false;
      window.removeEventListener("sio:expired", expired);
    };
  }, []);
  async function login(login, senha) {
    const data = await api("/auth/login", {
      method: "POST",
      body: { login, senha },
    });
    setUser(data.user);
    setError("");
  }
  async function logout() {
    await api("/auth/logout", { method: "POST" });
    setUser(null);
  }
  return (
    <Context.Provider value={{ user, loading, error, login, logout }}>
      {children}
    </Context.Provider>
  );
}
export const useAuth = () => useContext(Context);
