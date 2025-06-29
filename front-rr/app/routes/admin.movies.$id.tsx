import { useEffect, useState } from 'react';
// import type { Route } from './+types/admin.movies.$id';

interface MovieData {
  uid: string;
  year: number | null;
  originalLanguage: string | null;
  imdbId: string | null;
  tmdbId: number | null;
  createdAt: string;
  updatedAt: string;
}

interface Translation {
  uid: string;
  languageCode: string;
  content: string;
  isDefault: boolean;
}

interface Nomination {
  uid: string;
  isWinner: boolean;
  category: {
    name: string;
  };
  ceremony: {
    year: number;
    organization: {
      name: string;
    };
  };
}

interface PosterUrl {
  uid: string;
  url: string;
  width: number | null;
  height: number | null;
  languageCode: string | null;
  source: string | null;
  isPrimary: boolean;
}

interface MovieDetails {
  movie: MovieData;
  translations: Translation[];
  nominations: Nomination[];
  posterUrls: PosterUrl[];
}

export function meta({ params }: any): any {
  return [
    { title: `映画の編集 - SHINE Admin` },
    { name: 'description', content: 'SHINE Admin 映画編集画面' }
  ];
}

export async function loader({ context, params }: any) {
  const { id } = params;
  
  if (!id) {
    throw new Response('Movie ID is required', { status: 400 });
  }

  return {
    apiUrl: context.cloudflare.env.PUBLIC_API_URL || 'http://localhost:8787',
    movieId: id
  };
}

const handleLogout = () => {
  if (typeof globalThis !== 'undefined' && globalThis.localStorage) {
    globalThis.localStorage.removeItem('adminToken');
    globalThis.location.href = '/admin/login';
  }
};

export default function AdminMovieEdit({ loaderData }: any) {
  const { apiUrl, movieId } = loaderData as {
    apiUrl: string;
    movieId: string;
  };

  const [movieData, setMovieData] = useState<MovieDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load movie data
  useEffect(() => {
    const loadMovie = async () => {
      if (globalThis.window === undefined) return;
      
      const token = globalThis.localStorage.getItem('adminToken');
      if (!token) {
        globalThis.location.href = '/admin/login';
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const response = await fetch(`${apiUrl}/movies/${movieId}`, {
          headers: { Authorization: `Bearer ${token}` }
        });

        if (response.status === 401) {
          globalThis.localStorage.removeItem('adminToken');
          globalThis.location.href = '/admin/login';
          return;
        }

        if (!response.ok) {
          throw new Error('Failed to fetch movie data');
        }

        const data = await response.json() as MovieDetails;
        setMovieData(data);
      } catch (error) {
        console.error('Error loading movie:', error);
        setError('Failed to load movie data');
      } finally {
        setLoading(false);
      }
    };

    loadMovie();
  }, [apiUrl, movieId]);

  if (loading) {
    return (
      <main style={{
        minHeight: '100vh',
        background: '#f3f4f6',
        padding: '20px 0'
      }}>
        <div style={{
          maxWidth: '800px',
          margin: '0 auto 20px',
          padding: '0 20px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <h1 style={{
            margin: 0,
            color: '#1f2937',
            fontSize: '1.875rem'
          }}>
            映画の編集
          </h1>
          <div style={{ display: 'flex', gap: '12px' }}>
            <a
              href="/admin/movies"
              style={{
                padding: '8px 16px',
                border: 'none',
                borderRadius: '4px',
                textDecoration: 'none',
                fontSize: '0.875rem',
                fontWeight: 500,
                cursor: 'pointer',
                display: 'inline-block',
                background: '#6b7280',
                color: 'white'
              }}
            >
              ← 一覧に戻る
            </a>
            <button
              onClick={handleLogout}
              style={{
                padding: '8px 16px',
                border: 'none',
                borderRadius: '4px',
                fontSize: '0.875rem',
                fontWeight: 500,
                cursor: 'pointer',
                background: '#dc2626',
                color: 'white'
              }}
            >
              ログアウト
            </button>
          </div>
        </div>
        <div style={{
          maxWidth: '800px',
          margin: '0 auto',
          padding: '0 20px'
        }}>
          <div style={{
            textAlign: 'center',
            background: 'white',
            borderRadius: '8px',
            boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
            padding: '3rem',
            color: '#666'
          }}>
            データを読み込み中...
          </div>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main style={{
        minHeight: '100vh',
        background: '#f3f4f6',
        padding: '20px 0'
      }}>
        <div style={{
          maxWidth: '800px',
          margin: '0 auto 20px',
          padding: '0 20px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <h1 style={{
            margin: 0,
            color: '#1f2937',
            fontSize: '1.875rem'
          }}>
            映画の編集
          </h1>
          <div style={{ display: 'flex', gap: '12px' }}>
            <a
              href="/admin/movies"
              style={{
                padding: '8px 16px',
                border: 'none',
                borderRadius: '4px',
                textDecoration: 'none',
                fontSize: '0.875rem',
                fontWeight: 500,
                cursor: 'pointer',
                display: 'inline-block',
                background: '#6b7280',
                color: 'white'
              }}
            >
              ← 一覧に戻る
            </a>
            <button
              onClick={handleLogout}
              style={{
                padding: '8px 16px',
                border: 'none',
                borderRadius: '4px',
                fontSize: '0.875rem',
                fontWeight: 500,
                cursor: 'pointer',
                background: '#dc2626',
                color: 'white'
              }}
            >
              ログアウト
            </button>
          </div>
        </div>
        <div style={{
          maxWidth: '800px',
          margin: '0 auto',
          padding: '0 20px'
        }}>
          <div style={{
            textAlign: 'center',
            background: 'white',
            borderRadius: '8px',
            boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
            padding: '3rem',
            color: '#dc2626'
          }}>
            {error}
          </div>
        </div>
      </main>
    );
  }

  if (!movieData) {
    return (
      <main style={{
        minHeight: '100vh',
        background: '#f3f4f6',
        padding: '20px 0'
      }}>
        <div style={{
          maxWidth: '800px',
          margin: '0 auto',
          padding: '0 20px'
        }}>
          <div style={{
            textAlign: 'center',
            background: 'white',
            borderRadius: '8px',
            boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
            padding: '3rem',
            color: '#666'
          }}>
            映画が見つかりません
          </div>
        </div>
      </main>
    );
  }

  const primaryTitle = movieData.translations.find(t => t.isDefault)?.content ||
                     movieData.translations.find(t => t.languageCode === 'ja')?.content ||
                     movieData.translations[0]?.content ||
                     '無題';

  return (
    <main style={{
      minHeight: '100vh',
      background: '#f3f4f6',
      padding: '20px 0'
    }}>
      {/* Header */}
      <div style={{
        maxWidth: '800px',
        margin: '0 auto 20px',
        padding: '0 20px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <h1 style={{
          margin: 0,
          color: '#1f2937',
          fontSize: '1.875rem'
        }}>
          映画の編集
        </h1>
        <div style={{ display: 'flex', gap: '12px' }}>
          <a
            href="/admin/movies"
            style={{
              padding: '8px 16px',
              border: 'none',
              borderRadius: '4px',
              textDecoration: 'none',
              fontSize: '0.875rem',
              fontWeight: 500,
              cursor: 'pointer',
              display: 'inline-block',
              background: '#6b7280',
              color: 'white'
            }}
            onMouseOver={(e) => e.currentTarget.style.background = '#4b5563'}
            onMouseOut={(e) => e.currentTarget.style.background = '#6b7280'}
          >
            ← 一覧に戻る
          </a>
          <button
            onClick={handleLogout}
            style={{
              padding: '8px 16px',
              border: 'none',
              borderRadius: '4px',
              fontSize: '0.875rem',
              fontWeight: 500,
              cursor: 'pointer',
              background: '#dc2626',
              color: 'white'
            }}
            onMouseOver={(e) => e.currentTarget.style.background = '#b91c1c'}
            onMouseOut={(e) => e.currentTarget.style.background = '#dc2626'}
          >
            ログアウト
          </button>
        </div>
      </div>

      {/* Editor Content */}
      <div style={{
        maxWidth: '800px',
        margin: '0 auto',
        padding: '0 20px'
      }}>
        {/* Movie Info */}
        <div style={{
          background: 'white',
          borderRadius: '8px',
          boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
          padding: '24px',
          marginBottom: '20px'
        }}>
          <h2 style={{
            margin: '0 0 20px 0',
            color: '#1f2937',
            fontSize: '1.25rem',
            fontWeight: 600
          }}>
            映画情報
          </h2>
          <h3 style={{
            margin: '0 0 16px 0',
            color: '#1f2937',
            fontSize: '1.125rem',
            fontWeight: 500
          }}>
            {primaryTitle}
          </h3>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '16px'
          }}>
            <div>
              <label style={{ fontWeight: 600, color: '#374151' }}>年:</label>
              <span style={{ marginLeft: '8px', color: '#6b7280' }}>
                {movieData.movie.year || 'N/A'}
              </span>
            </div>
            <div>
              <label style={{ fontWeight: 600, color: '#374151' }}>原語:</label>
              <span style={{ marginLeft: '8px', color: '#6b7280' }}>
                {movieData.movie.originalLanguage || 'N/A'}
              </span>
            </div>
            <div>
              <label style={{ fontWeight: 600, color: '#374151' }}>IMDb ID:</label>
              <span style={{ marginLeft: '8px', color: '#6b7280' }}>
                {movieData.movie.imdbId || 'N/A'}
              </span>
            </div>
            <div>
              <label style={{ fontWeight: 600, color: '#374151' }}>TMDb ID:</label>
              <span style={{ marginLeft: '8px', color: '#6b7280' }}>
                {movieData.movie.tmdbId || 'N/A'}
              </span>
            </div>
          </div>
        </div>

        {/* Translations */}
        <div style={{
          background: 'white',
          borderRadius: '8px',
          boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
          padding: '24px',
          marginBottom: '20px'
        }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '20px'
          }}>
            <h3 style={{
              margin: 0,
              color: '#1f2937',
              fontSize: '1.125rem',
              fontWeight: 600
            }}>
              翻訳管理
            </h3>
          </div>
          {movieData.translations.length === 0 ? (
            <p style={{ color: '#6b7280', fontStyle: 'italic' }}>翻訳がありません</p>
          ) : (
            <div style={{
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              overflow: 'hidden'
            }}>
              <table style={{
                width: '100%',
                borderCollapse: 'collapse'
              }}>
                <thead>
                  <tr style={{ background: '#f9fafb' }}>
                    <th style={{
                      padding: '12px',
                      textAlign: 'left',
                      fontWeight: 600,
                      color: '#374151',
                      borderBottom: '1px solid #e5e7eb'
                    }}>
                      言語
                    </th>
                    <th style={{
                      padding: '12px',
                      textAlign: 'left',
                      fontWeight: 600,
                      color: '#374151',
                      borderBottom: '1px solid #e5e7eb'
                    }}>
                      タイトル
                    </th>
                    <th style={{
                      padding: '12px',
                      textAlign: 'left',
                      fontWeight: 600,
                      color: '#374151',
                      borderBottom: '1px solid #e5e7eb'
                    }}>
                      デフォルト
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {movieData.translations.map((translation) => (
                    <tr key={translation.uid}>
                      <td style={{
                        padding: '12px',
                        borderBottom: '1px solid #e5e7eb'
                      }}>
                        {translation.languageCode}
                      </td>
                      <td style={{
                        padding: '12px',
                        borderBottom: '1px solid #e5e7eb'
                      }}>
                        {translation.content}
                      </td>
                      <td style={{
                        padding: '12px',
                        borderBottom: '1px solid #e5e7eb'
                      }}>
                        {translation.isDefault && (
                          <span style={{
                            background: '#dcfce7',
                            color: '#166534',
                            padding: '2px 8px',
                            borderRadius: '4px',
                            fontSize: '0.875rem'
                          }}>
                            デフォルト
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Nominations */}
        <div style={{
          background: 'white',
          borderRadius: '8px',
          boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
          padding: '24px',
          marginBottom: '20px'
        }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '20px'
          }}>
            <h3 style={{
              margin: 0,
              color: '#1f2937',
              fontSize: '1.125rem',
              fontWeight: 600
            }}>
              ノミネート管理
            </h3>
          </div>
          {movieData.nominations.length === 0 ? (
            <p style={{ color: '#6b7280', fontStyle: 'italic' }}>ノミネートがありません</p>
          ) : (
            <div style={{
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              overflow: 'hidden'
            }}>
              <table style={{
                width: '100%',
                borderCollapse: 'collapse'
              }}>
                <thead>
                  <tr style={{ background: '#f9fafb' }}>
                    <th style={{
                      padding: '12px',
                      textAlign: 'left',
                      fontWeight: 600,
                      color: '#374151',
                      borderBottom: '1px solid #e5e7eb'
                    }}>
                      団体
                    </th>
                    <th style={{
                      padding: '12px',
                      textAlign: 'left',
                      fontWeight: 600,
                      color: '#374151',
                      borderBottom: '1px solid #e5e7eb'
                    }}>
                      年度
                    </th>
                    <th style={{
                      padding: '12px',
                      textAlign: 'left',
                      fontWeight: 600,
                      color: '#374151',
                      borderBottom: '1px solid #e5e7eb'
                    }}>
                      カテゴリ
                    </th>
                    <th style={{
                      padding: '12px',
                      textAlign: 'left',
                      fontWeight: 600,
                      color: '#374151',
                      borderBottom: '1px solid #e5e7eb'
                    }}>
                      結果
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {movieData.nominations.map((nomination) => (
                    <tr key={nomination.uid}>
                      <td style={{
                        padding: '12px',
                        borderBottom: '1px solid #e5e7eb'
                      }}>
                        {nomination.ceremony.organization.name}
                      </td>
                      <td style={{
                        padding: '12px',
                        borderBottom: '1px solid #e5e7eb'
                      }}>
                        {nomination.ceremony.year}
                      </td>
                      <td style={{
                        padding: '12px',
                        borderBottom: '1px solid #e5e7eb'
                      }}>
                        {nomination.category.name}
                      </td>
                      <td style={{
                        padding: '12px',
                        borderBottom: '1px solid #e5e7eb'
                      }}>
                        {nomination.isWinner ? (
                          <span style={{
                            background: '#fef3c7',
                            color: '#92400e',
                            padding: '2px 8px',
                            borderRadius: '4px',
                            fontSize: '0.875rem'
                          }}>
                            受賞
                          </span>
                        ) : (
                          <span style={{
                            background: '#f3f4f6',
                            color: '#6b7280',
                            padding: '2px 8px',
                            borderRadius: '4px',
                            fontSize: '0.875rem'
                          }}>
                            ノミネート
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Posters */}
        <div style={{
          background: 'white',
          borderRadius: '8px',
          boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
          padding: '24px',
          marginBottom: '20px'
        }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '20px'
          }}>
            <h3 style={{
              margin: 0,
              color: '#1f2937',
              fontSize: '1.125rem',
              fontWeight: 600
            }}>
              ポスター管理
            </h3>
          </div>
          {movieData.posterUrls.length === 0 ? (
            <p style={{ color: '#6b7280', fontStyle: 'italic' }}>ポスターがありません</p>
          ) : (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
              gap: '16px'
            }}>
              {movieData.posterUrls.map((poster) => (
                <div
                  key={poster.uid}
                  style={{
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    overflow: 'hidden',
                    background: 'white'
                  }}
                >
                  <img
                    src={poster.url}
                    alt="Movie poster"
                    style={{
                      width: '100%',
                      height: '200px',
                      objectFit: 'cover'
                    }}
                  />
                  <div style={{
                    padding: '8px'
                  }}>
                    {poster.isPrimary && (
                      <span style={{
                        background: '#dcfce7',
                        color: '#166534',
                        padding: '2px 6px',
                        borderRadius: '4px',
                        fontSize: '0.75rem',
                        fontWeight: 500
                      }}>
                        プライマリ
                      </span>
                    )}
                    {poster.languageCode && (
                      <div style={{
                        fontSize: '0.75rem',
                        color: '#6b7280',
                        marginTop: '4px'
                      }}>
                        言語: {poster.languageCode}
                      </div>
                    )}
                    {poster.source && (
                      <div style={{
                        fontSize: '0.75rem',
                        color: '#6b7280',
                        marginTop: '2px'
                      }}>
                        ソース: {poster.source}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}