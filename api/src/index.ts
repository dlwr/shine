import { getDatabase, type Environment, and, eq, sql } from "db";
import { awardCategories } from "db/schema/award-categories";
import { awardCeremonies } from "db/schema/award-ceremonies";
import { awardOrganizations } from "db/schema/award-organizations";
import { movieSelections } from "db/schema/movie-selections";
import { movies } from "db/schema/movies";
import { nominations } from "db/schema/nominations";
import { posterUrls } from "db/schema/poster-urls";
import { translations } from "db/schema/translations";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { authMiddleware, createJWT } from "./auth";

const app = new Hono<{ Bindings: Environment }>();

app.use("*", cors());

function simpleHash(input: string): number {
  let hash = 0;
  for (let index = 0; index < input.length; index++) {
    const char = input.codePointAt(index) || 0;
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash);
}

function getSelectionDate(
  date: Date,
  type: "daily" | "weekly" | "monthly"
): string {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();

  switch (type) {
    case "daily": {
      return `${year}-${month.toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
    }
    case "weekly": {
      const daysSinceFriday = (date.getDay() - 5 + 7) % 7;
      const fridayDate = new Date(date);
      fridayDate.setDate(day - daysSinceFriday);
      return `${fridayDate.getFullYear()}-${(fridayDate.getMonth() + 1).toString().padStart(2, "0")}-${fridayDate.getDate().toString().padStart(2, "0")}`;
    }
    case "monthly": {
      return `${year}-${month.toString().padStart(2, "0")}-01`;
    }
  }
}

function getDateSeed(date: Date, type: "daily" | "weekly" | "monthly"): number {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();

  switch (type) {
    case "daily": {
      const dateString = `${year}-${month.toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
      return simpleHash(`daily-${dateString}`);
    }
    case "weekly": {
      const daysSinceFriday = (date.getDay() - 5 + 7) % 7;
      const fridayDate = new Date(date);
      fridayDate.setDate(day - daysSinceFriday);
      const weekString = `${fridayDate.getFullYear()}-${(fridayDate.getMonth() + 1).toString().padStart(2, "0")}-${fridayDate.getDate().toString().padStart(2, "0")}`;
      return simpleHash(`weekly-${weekString}`);
    }
    case "monthly": {
      const monthString = `${year}-${month.toString().padStart(2, "0")}`;
      return simpleHash(`monthly-${monthString}`);
    }
  }
}

async function getMovieNominations(
  database: ReturnType<typeof getDatabase>,
  movieId: string
) {
  const nominationsData = await database
    .select({
      nominationUid: nominations.uid,
      isWinner: nominations.isWinner,
      specialMention: nominations.specialMention,
      categoryUid: awardCategories.uid,
      categoryName: awardCategories.name,
      categoryNameEn: awardCategories.nameEn,
      ceremonyUid: awardCeremonies.uid,
      ceremonyNumber: awardCeremonies.ceremonyNumber,
      ceremonyYear: awardCeremonies.year,
      organizationUid: awardOrganizations.uid,
      organizationName: awardOrganizations.name,
      organizationShortName: awardOrganizations.shortName,
    })
    .from(nominations)
    .innerJoin(
      awardCategories,
      eq(nominations.categoryUid, awardCategories.uid)
    )
    .innerJoin(
      awardCeremonies,
      eq(nominations.ceremonyUid, awardCeremonies.uid)
    )
    .innerJoin(
      awardOrganizations,
      eq(awardCeremonies.organizationUid, awardOrganizations.uid)
    )
    .where(eq(nominations.movieUid, movieId))
    .orderBy(
      awardCeremonies.year,
      awardOrganizations.name,
      awardCategories.name
    );

  return nominationsData.map((nom: typeof nominationsData[0]) => ({
    uid: nom.nominationUid,
    isWinner: nom.isWinner === 1,
    specialMention: nom.specialMention,
    category: {
      uid: nom.categoryUid,
      name: nom.categoryNameEn || nom.categoryName,
    },
    ceremony: {
      uid: nom.ceremonyUid,
      number: nom.ceremonyNumber,
      year: nom.ceremonyYear,
    },
    organization: {
      uid: nom.organizationUid,
      name: nom.organizationName,
      shortName: nom.organizationShortName,
    },
  }));
}

async function getMovieByDateSeed(
  database: ReturnType<typeof getDatabase>,
  date: Date,
  type: "daily" | "weekly" | "monthly",
  preferredLanguage = "en",
  forceNew = false
) {
  const selectionDate = getSelectionDate(date, type);

  // First, check if we already have a selection for this date and type
  const existingSelection = await database
    .select()
    .from(movieSelections)
    .where(
      and(
        eq(movieSelections.selectionType, type),
        eq(movieSelections.selectionDate, selectionDate)
      )
    )
    .limit(1);

  let movieId: string;

  if (existingSelection.length > 0 && !forceNew) {
    // Use the existing selection
    movieId = existingSelection[0].movieId;
  } else {
    // Generate a new selection
    let seed = getDateSeed(date, type);
    
    // If forcing new selection, add extra randomness
    if (forceNew) {
      seed = seed + Date.now();
    }

    // Get a random movie using the seed
    const randomMovieResult = await database
      .select({ uid: movies.uid })
      .from(movies)
      .orderBy(
        sql`(ABS(${seed} % (SELECT COUNT(*) FROM movies)) + movies.rowid) % (SELECT COUNT(*) FROM movies)`
      )
      .limit(1);

    if (randomMovieResult.length === 0) {
      return;
    }

    movieId = randomMovieResult[0].uid;

    // Save the new selection to the database (replace existing if needed)
    try {
      if (existingSelection.length > 0) {
        // Delete existing selection first
        await database
          .delete(movieSelections)
          .where(
            and(
              eq(movieSelections.selectionType, type),
              eq(movieSelections.selectionDate, selectionDate)
            )
          );
      }
      
      await database.insert(movieSelections).values({
        selectionType: type,
        selectionDate: selectionDate,
        movieId: movieId,
      });
    } catch (error) {
      // If there's a race condition and another instance already inserted this selection,
      // just continue with the movieId we selected
      console.error("Error saving movie selection:", error);
    }
  }

  // Now fetch the full movie details with translations and poster
  const results = await database
    .select()
    .from(movies)
    .leftJoin(
      translations,
      and(
        eq(movies.uid, translations.resourceUid),
        eq(translations.resourceType, "movie_title"),
        eq(translations.languageCode, preferredLanguage)
      )
    )
    .leftJoin(posterUrls, eq(movies.uid, posterUrls.movieUid))
    .where(eq(movies.uid, movieId))
    .limit(1);

  if (results.length === 0 || !results[0].translations?.content) {
    // Try with default language
    const fallbackResults = await database
      .select()
      .from(movies)
      .leftJoin(
        translations,
        and(
          eq(movies.uid, translations.resourceUid),
          eq(translations.resourceType, "movie_title"),
          eq(translations.isDefault, 1)
        )
      )
      .leftJoin(posterUrls, eq(movies.uid, posterUrls.movieUid))
      .where(eq(movies.uid, movieId))
      .limit(1);

    if (fallbackResults.length > 0) {
      const {
        movies: movie,
        translations: translation,
        poster_urls: poster,
      } = fallbackResults[0];

      const imdbUrl = movie.imdbId
        ? `https://www.imdb.com/title/${movie.imdbId}/`
        : undefined;

      // Get nominations for this movie
      const movieNominations = await getMovieNominations(database, movie.uid);

      return {
        uid: movie.uid,
        year: movie.year,
        originalLanguage: movie.originalLanguage,
        title: translation?.content,
        posterUrl: poster?.url,
        imdbUrl: imdbUrl,
        nominations: movieNominations,
      };
    }
  }

  if (results.length === 0) {
    return;
  }

  const {
    movies: movie,
    translations: translation,
    poster_urls: poster,
  } = results[0];

  const imdbUrl = movie.imdbId
    ? `https://www.imdb.com/title/${movie.imdbId}/`
    : undefined;

  // Get nominations for this movie
  const movieNominations = await getMovieNominations(database, movie.uid);

  return {
    uid: movie.uid,
    year: movie.year,
    originalLanguage: movie.originalLanguage,
    title: translation?.content,
    posterUrl: poster?.url,
    imdbUrl: imdbUrl,
    nominations: movieNominations,
  };
}

function parseAcceptLanguage(acceptLanguage?: string): string[] {
  if (!acceptLanguage) return [];

  return acceptLanguage
    .split(",")
    .map((lang) => {
      const [code, q] = lang.trim().split(";q=");
      return {
        code: code.split("-")[0],
        quality: q ? Number.parseFloat(q) : 1,
      };
    })
    .sort((a, b) => b.quality - a.quality)
    .map((lang) => lang.code);
}

app.get("/admin/login", async (c) => {
  const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Admin Login - SHINE</title>
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          background: #f5f5f5;
          margin: 0;
          padding: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 100vh;
        }
        .login-container {
          background: white;
          padding: 2rem;
          border-radius: 8px;
          box-shadow: 0 2px 10px rgba(0,0,0,0.1);
          width: 100%;
          max-width: 400px;
        }
        h1 {
          text-align: center;
          margin-bottom: 2rem;
          color: #333;
        }
        input {
          width: 100%;
          padding: 0.75rem;
          border: 1px solid #ddd;
          border-radius: 4px;
          font-size: 1rem;
          margin-bottom: 1rem;
          box-sizing: border-box;
        }
        button {
          width: 100%;
          padding: 0.75rem;
          background: #2563eb;
          color: white;
          border: none;
          border-radius: 4px;
          font-size: 1rem;
          cursor: pointer;
        }
        button:hover {
          background: #1d4ed8;
        }
        button:disabled {
          background: #9ca3af;
          cursor: not-allowed;
        }
        .error {
          color: #dc2626;
          font-size: 0.875rem;
          margin-top: 1rem;
          text-align: center;
        }
        .success {
          color: #059669;
          font-size: 0.875rem;
          margin-top: 1rem;
          text-align: center;
        }
      </style>
    </head>
    <body>
      <div class="login-container">
        <h1>SHINE Admin Login</h1>
        <form id="loginForm">
          <input type="password" id="password" placeholder="Enter admin password" required>
          <button type="submit" id="submitBtn">Login</button>
        </form>
        <div id="message"></div>
      </div>
      
      <script>
        const form = document.getElementById('loginForm');
        const passwordInput = document.getElementById('password');
        const submitBtn = document.getElementById('submitBtn');
        const message = document.getElementById('message');
        
        form.addEventListener('submit', async (e) => {
          e.preventDefault();
          
          const password = passwordInput.value;
          if (!password) return;
          
          submitBtn.disabled = true;
          submitBtn.textContent = 'Logging in...';
          message.textContent = '';
          
          try {
            const response = await fetch('/auth/login', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({ password })
            });
            
            if (response.ok) {
              const { token } = await response.json();
              localStorage.setItem('adminToken', token);
              message.className = 'success';
              message.textContent = 'Login successful! Redirecting...';
              
              setTimeout(() => {
                window.location.href = '/';
              }, 1000);
            } else {
              message.className = 'error';
              message.textContent = 'Invalid password';
            }
          } catch (error) {
            message.className = 'error';
            message.textContent = 'Login failed. Please try again.';
          } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Login';
          }
        });
      </script>
    </body>
    </html>
  `;
  
  return c.html(html);
});

app.post("/auth/login", async (c) => {
  const { password } = await c.req.json();
  
  if (!password || !c.env.ADMIN_PASSWORD || password !== c.env.ADMIN_PASSWORD) {
    return c.json({ error: "Invalid password" }, 401);
  }
  
  if (!c.env.JWT_SECRET) {
    return c.json({ error: "JWT_SECRET not configured" }, 500);
  }
  
  const token = await createJWT(c.env.JWT_SECRET);
  return c.json({ token });
});

app.get("/admin/logout", async (c) => {
  const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Admin Logout - SHINE</title>
    </head>
    <body>
      <script>
        localStorage.removeItem('adminToken');
        window.location.href = '/';
      </script>
    </body>
    </html>
  `;
  
  return c.html(html);
});

app.get("/", async (c) => {
  try {
    const database = getDatabase(c.env as Environment);
    const now = new Date();

    const localeParameter = c.req.query("locale");
    const acceptLanguage = c.req.header("accept-language");
    const preferredLanguages = localeParameter
      ? [localeParameter]
      : parseAcceptLanguage(acceptLanguage);
    const locale =
      preferredLanguages.find((lang) => ["en", "ja"].includes(lang)) || "en";

    const [dailyMovie, weeklyMovie, monthlyMovie] = await Promise.all([
      getMovieByDateSeed(database, now, "daily", locale),
      getMovieByDateSeed(database, now, "weekly", locale),
      getMovieByDateSeed(database, now, "monthly", locale),
    ]);

    return c.json({
      daily: dailyMovie,
      weekly: weeklyMovie,
      monthly: monthlyMovie,
    });
  } catch (error) {
    console.error("Error fetching feature movies:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

app.post("/reselect", authMiddleware, async (c) => {
  try {
    const database = getDatabase(c.env as Environment);
    const now = new Date();

    const body = await c.req.json();
    const { type, locale = "en" } = body;

    if (!type || !["daily", "weekly", "monthly"].includes(type)) {
      return c.json({ error: "Invalid selection type" }, 400);
    }

    const movie = await getMovieByDateSeed(database, now, type, locale, true);

    return c.json({
      type,
      movie,
    });
  } catch (error) {
    console.error("Error reselecting movie:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

export default app;
