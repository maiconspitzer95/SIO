import { chromium, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { createPool } from "../server/config/database.js";
import { createApp } from "../server/app.js";
import { hashPassword } from "../server/services/passwords.js";

export async function browserSmoke(connectionString) {
  const config = {
    DATABASE_URL: connectionString,
    ssl: false,
    NODE_ENV: "test",
    APP_ORIGIN: "http://127.0.0.1",
    SESSION_SECRET: randomBytes(48).toString("hex"),
    SESSION_IDLE_MINUTES: 30,
    SESSION_ABSOLUTE_HOURS: 8,
    TRUST_PROXY: "0",
  };
  const pool = createPool(config);
  let server, browser;
  try {
    const password = randomBytes(24).toString("hex");
    await pool.query("UPDATE usuarios SET senha_hash=$1 WHERE login='master'", [
      await hashPassword(password),
    ]);
    await pool.query("DELETE FROM limites_acesso");
    const app = await createApp(pool, config);
    server = await new Promise((resolveServer) => {
      const s = app.listen(0, "127.0.0.1", () => resolveServer(s));
    });
    config.APP_ORIGIN = `http://127.0.0.1:${server.address().port}`;
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({
      viewport: { width: 1440, height: 1000 },
      reducedMotion: "reduce",
    });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await mkdir("test-results", { recursive: true });
    await page.goto(config.APP_ORIGIN);
    await expect(
      page.getByRole("heading", { name: "Bem-vindo ao SIO" }),
    ).toBeVisible();
    await page.screenshot({
      path: "test-results/login-desktop.png",
      fullPage: true,
    });
    await page.getByRole("button", { name: "Esqueci minha senha" }).click();
    await expect(page.getByLabel("Código de recuperação")).toBeVisible();
    await page.getByRole("button", { name: "Voltar para o login" }).click();
    await page.getByLabel("Usuário", { exact: true }).fill("master");
    await page.getByLabel("Senha", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Entrar no sistema" }).click();
    await expect(
      page.getByRole("heading", { name: "Visão geral" }),
    ).toBeVisible();
    await page.screenshot({
      path: "test-results/home-desktop.png",
      fullPage: true,
    });
    await page.getByRole("link", { name: "Perfis e permissões" }).click();
    await expect(
      page.getByRole("heading", { name: "Administração técnica" }),
    ).toBeVisible();
    await page.getByRole("link", { name: "Auditoria", exact: true }).click();
    await expect(
      page.getByRole("cell", { name: "auth.login", exact: true }).first(),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Auditoria técnica" }),
    ).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("button", { name: "Abrir menu" }).click();
    await page.getByRole("link", { name: "Visão geral" }).click();
    await expect(
      page.getByRole("heading", { name: "Visão geral" }),
    ).toBeVisible();
    if (
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      )
    )
      throw new Error("Overflow horizontal em viewport móvel.");
    await page.screenshot({
      path: "test-results/home-mobile.png",
      fullPage: true,
    });
    await page.getByRole("button", { name: "Sair do sistema" }).click();
    await expect(
      page.getByRole("heading", { name: "Bem-vindo ao SIO" }),
    ).toBeVisible();
    await page.screenshot({
      path: "test-results/login-mobile.png",
      fullPage: true,
    });
    expect(errors).toEqual([]);
    console.log(
      "OK: navegador Chromium — login, recuperação, navegação, auditoria, refresh, layout móvel e logout.",
    );
  } finally {
    if (browser) await browser.close();
    if (server) await new Promise((r) => server.close(r));
    await pool.end();
  }
}
