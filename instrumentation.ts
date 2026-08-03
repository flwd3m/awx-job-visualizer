export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { validateAwxConfig } = await import("./app/lib/config");
    validateAwxConfig();
  }
}
