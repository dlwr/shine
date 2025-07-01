import { useEffect } from "react";
import { useNavigate } from "react-router";
import type { Route } from "./+types/admin.login";

export function meta(): Route.MetaDescriptors {
  return [
    { title: "管理者ログイン | SHINE" },
    { name: "description", content: "SHINE管理画面へのログイン" },
  ];
}

// サーバーサイドでの認証チェックは行わない（React RouterではlocalStorageアクセス不可）
export async function loader() {
  // クライアントサイドで認証チェックする
  return {};
}

export async function action({ context, request }: Route.ActionArgs) {
  try {
    const formData = await request.formData();
    const password = formData.get("password") as string;

    const apiUrl =
      context.cloudflare.env.PUBLIC_API_URL || "http://localhost:8787";
    const response = await fetch(`${apiUrl}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
      signal: request.signal, // React Router v7推奨：abortシグナル
    });

    if (response.status === 401) {
      return { error: "パスワードが正しくありません" };
    }

    if (!response.ok) {
      return { error: "ログインに失敗しました" };
    }

    const data = (await response.json()) as { token: string };
    // サーバーサイドではlocalStorageにアクセスできないため、
    // クライアントサイドでトークンを保存してからリダイレクト
    return { success: true, token: data.token };
  } catch {
    return { error: "ログインに失敗しました" };
  }
}

export default function AdminLogin({ actionData }: Route.ComponentProps) {
  const navigate = useNavigate();

  // ログイン済みかチェック
  useEffect(() => {
    if (globalThis.window !== undefined) {
      const existingToken = localStorage.getItem("adminToken");
      if (existingToken) {
        navigate("/admin/movies", { replace: true });
      }
    }
  }, [navigate]);

  // ログイン成功時の処理
  useEffect(() => {
    if (
      actionData?.success &&
      actionData?.token &&
      globalThis.window !== undefined
    ) {
      localStorage.setItem("adminToken", actionData.token);
      console.log("Token saved, redirecting to /admin/movies");

      // イベント発火でother componentsに通知
      globalThis.dispatchEvent(new Event("adminLogin"));

      navigate("/admin/movies", { replace: true });
    }
  }, [actionData, navigate]);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="max-w-md w-full bg-white rounded-lg shadow-md p-8">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            管理者ログイン
          </h1>
          <p className="text-gray-600">SHINE管理画面</p>
        </div>

        <form method="post" className="space-y-6">
          <div>
            <label
              htmlFor="password"
              className="block text-sm font-medium text-gray-700 mb-2"
            >
              パスワード
            </label>
            <input
              type="password"
              id="password"
              name="password"
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="管理者パスワードを入力"
            />
          </div>

          {actionData?.error && (
            <div className="bg-red-50 border border-red-200 rounded-md p-3">
              <p className="text-sm text-red-600">{actionData.error}</p>
            </div>
          )}

          <button
            type="submit"
            className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors"
          >
            ログイン
          </button>
        </form>

        <div className="mt-6 text-center">
          <a
            href="/"
            className="text-blue-600 hover:text-blue-800 text-sm transition-colors"
          >
            ← ホームに戻る
          </a>
        </div>
      </div>
    </div>
  );
}
