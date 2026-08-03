export type AwxConfig = {
  baseUrl: URL;
  headers: Headers;
};

class AwxConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AwxConfigurationError";
  }
}

export const getAwxConfig = (): AwxConfig => {
  const rawUrl = process.env.AWX_URL?.trim();
  if (!rawUrl) {
    throw new AwxConfigurationError(
      "AWX_URL is missing. Set it to the base URL of your AWX instance.",
    );
  }

  let baseUrl: URL;
  try {
    baseUrl = new URL(rawUrl);
  } catch {
    throw new AwxConfigurationError(
      "AWX_URL is invalid. Use a complete URL such as https://awx.example.com.",
    );
  }
  if (baseUrl.protocol !== "http:" && baseUrl.protocol !== "https:") {
    throw new AwxConfigurationError(
      "AWX_URL must use the http:// or https:// protocol.",
    );
  }

  const token = process.env.AWX_TOKEN?.trim();
  if (token) {
    return {
      baseUrl,
      headers: new Headers([["Authorization", `Bearer ${token}`]]),
    };
  }

  const username = process.env.AWX_USERNAME?.trim();
  const password = process.env.AWX_PASSWORD;
  if (!username && !password) {
    throw new AwxConfigurationError(
      "AWX credentials are missing. Set AWX_TOKEN, or set both AWX_USERNAME and AWX_PASSWORD.",
    );
  }
  if (!username) {
    throw new AwxConfigurationError(
      "AWX_USERNAME is missing. Set it together with AWX_PASSWORD, or use AWX_TOKEN.",
    );
  }
  if (!password) {
    throw new AwxConfigurationError(
      "AWX_PASSWORD is missing. Set it together with AWX_USERNAME, or use AWX_TOKEN.",
    );
  }

  const credentials = Buffer.from(`${username}:${password}`).toString("base64");
  return {
    baseUrl,
    headers: new Headers([["Authorization", `Basic ${credentials}`]]),
  };
};

export const validateAwxConfig = (): void => {
  getAwxConfig();
};
