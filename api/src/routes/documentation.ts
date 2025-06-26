import type { Environment } from "db";
import { Hono } from "hono";

const documentationRoutes = new Hono<{ Bindings: Environment }>();

documentationRoutes.get("/openapi.yml", async c => {
  const openapiSpec = `openapi: 3.0.3
info:
  title: SHINE Movie Database API
  description: |
    SHINE is a comprehensive movie database API designed to be the world's most organized movie database. 
    It collects and organizes movie information, awards, nominations, and multilingual translations.
    
    **Features:**
    - Date-seeded movie selections (daily/weekly/monthly)
    - Comprehensive awards and nominations tracking
    - Multilingual movie title support
    - User-submitted article links
    - Admin management interface
    
    **Authentication:**
    - Public endpoints require no authentication
    - Admin endpoints require JWT Bearer token
    
    **Rate Limiting:**
    - Article link submissions: 10 per hour per IP
  version: 1.0.0
  contact:
    name: SHINE Movie Database
    url: https://shine-film.com
  license:
    name: MIT
    url: https://opensource.org/licenses/MIT

servers:
  - url: ${new URL(c.req.url).origin}
    description: Current server

paths:
  /:
    get:
      summary: Get date-seeded movie selections
      description: Returns daily, weekly, and monthly movie selections using deterministic hash-based algorithms
      operationId: getMovieSelections
      tags:
        - Movies
      parameters:
        - name: locale
          in: query
          description: Language preference for movie titles
          required: false
          schema:
            type: string
            enum: [en, ja]
            default: en
      responses:
        '200':
          description: Successfully retrieved movie selections
          content:
            application/json:
              schema:
                type: object
                description: Movie selections for different periods
        '500':
          description: Internal server error

  /movies/search:
    get:
      summary: Search movies
      description: Search and filter movies with pagination support
      operationId: searchMovies
      tags:
        - Movies
      parameters:
        - name: q
          in: query
          description: Search query for movie titles
          required: false
          schema:
            type: string
            maxLength: 100
        - name: year
          in: query
          description: Filter by release year
          required: false
          schema:
            type: integer
            minimum: 1900
            maximum: 2100
        - name: language
          in: query
          description: Filter by original language
          required: false
          schema:
            type: string
            pattern: '^[a-z]{2}$'
        - name: hasAwards
          in: query
          description: Filter movies with awards/nominations
          required: false
          schema:
            type: boolean
        - name: page
          in: query
          description: Page number for pagination
          required: false
          schema:
            type: integer
            minimum: 1
            default: 1
        - name: limit
          in: query
          description: Number of items per page
          required: false
          schema:
            type: integer
            minimum: 1
            maximum: 100
            default: 20
      responses:
        '200':
          description: Successfully retrieved search results
        '400':
          description: Validation error
        '500':
          description: Internal server error

  /movies/{id}:
    get:
      summary: Get movie details
      description: Retrieve detailed information about a specific movie
      operationId: getMovieById
      tags:
        - Movies
      parameters:
        - name: id
          in: path
          description: Movie unique identifier
          required: true
          schema:
            type: string
            format: uuid
      responses:
        '200':
          description: Successfully retrieved movie details
        '404':
          description: Movie not found
        '500':
          description: Internal server error

  /auth/login:
    post:
      summary: Admin login
      description: Authenticate as admin and receive JWT token
      operationId: adminLogin
      tags:
        - Authentication
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required:
                - password
              properties:
                password:
                  type: string
                  description: Admin password
      responses:
        '200':
          description: Successfully authenticated
          content:
            application/json:
              schema:
                type: object
                properties:
                  token:
                    type: string
                    description: JWT token (valid for 24 hours)
        '401':
          description: Authentication failed
        '500':
          description: Internal server error

components:
  securitySchemes:
    BearerAuth:
      type: http
      scheme: bearer
      bearerFormat: JWT
      description: JWT token obtained from /auth/login endpoint

tags:
  - name: Movies
    description: Movie information and search operations
  - name: Authentication
    description: Admin authentication endpoints`;

  return c.text(openapiSpec, 200, {
    "Content-Type": "application/x-yaml",
    "Cache-Control": "public, max-age=3600",
  });
});

documentationRoutes.get("/", async c => {
  // Override CSP for documentation page to allow external CDN resources
  c.header(
    "Content-Security-Policy",
    "default-src 'self'; " +
      "script-src 'self' 'unsafe-inline' https://unpkg.com; " +
      "style-src 'self' 'unsafe-inline' https://unpkg.com https://fonts.googleapis.com; " +
      "font-src 'self' https://fonts.gstatic.com; " +
      "img-src 'self' data: https:; " +
      "connect-src 'self'; " +
      "object-src 'none'; " +
      "media-src 'self'; " +
      "form-action 'self';",
  );

  const baseUrl = new URL(c.req.url).origin;
  const openapiUrl = `${baseUrl}/docs/openapi.yml`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>SHINE Movie Database API Documentation</title>
  <link rel="stylesheet" type="text/css" href="https://unpkg.com/swagger-ui-dist@5.17.14/swagger-ui.css" />
  <link rel="icon" type="image/png" href="https://unpkg.com/swagger-ui-dist@5.17.14/favicon-32x32.png" sizes="32x32" />
  <link rel="icon" type="image/png" href="https://unpkg.com/swagger-ui-dist@5.17.14/favicon-16x16.png" sizes="16x16" />
  <style>
    html {
      box-sizing: border-box;
      overflow: -moz-scrollbars-vertical;
      overflow-y: scroll;
    }
    *, *:before, *:after {
      box-sizing: inherit;
    }
    body {
      margin:0;
      background: #fafafa;
    }
    .swagger-ui .top-bar {
      display: none;
    }
    .swagger-ui .info {
      margin: 20px 0;
    }
    .swagger-ui .info .title {
      color: #3b4151;
      font-size: 36px;
      font-weight: 600;
      margin-bottom: 20px;
    }
    .custom-header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 20px;
      text-align: center;
      margin-bottom: 0;
    }
    .custom-header h1 {
      margin: 0;
      font-size: 2.5rem;
      font-weight: 300;
    }
    .custom-header p {
      margin: 10px 0 0 0;
      opacity: 0.9;
      font-size: 1.1rem;
    }
  </style>
</head>
<body>
  <div class="custom-header">
    <h1>🎬 SHINE Movie Database API</h1>
    <p>Comprehensive REST API for movie information, awards, and multilingual content</p>
  </div>
  <div id="swagger-ui"></div>
  
  <script src="https://unpkg.com/swagger-ui-dist@5.17.14/swagger-ui-bundle.js"></script>
  <script src="https://unpkg.com/swagger-ui-dist@5.17.14/swagger-ui-standalone-preset.js"></script>
  <script>
    window.onload = function() {
      const ui = SwaggerUIBundle({
        url: '${openapiUrl}',
        dom_id: '#swagger-ui',
        deepLinking: true,
        presets: [
          SwaggerUIBundle.presets.apis,
          SwaggerUIStandalonePreset
        ],
        plugins: [
          SwaggerUIBundle.plugins.DownloadUrl
        ],
        layout: "StandaloneLayout",
        tryItOutEnabled: true,
        requestInterceptor: (request) => {
          // Auto-add Authorization header if JWT token is stored in localStorage
          const token = localStorage.getItem('jwtToken');
          if (token && !request.headers['Authorization']) {
            request.headers['Authorization'] = 'Bearer ' + token;
          }
          return request;
        },
        responseInterceptor: (response) => {
          // Store JWT token from login response
          if (response.url.includes('/auth/login') && response.status === 200) {
            try {
              const data = JSON.parse(response.text);
              if (data.token) {
                localStorage.setItem('jwtToken', data.token);
                console.log('JWT token stored for future requests');
              }
            } catch (e) {
              // Ignore JSON parse errors
            }
          }
          return response;
        },
        onComplete: () => {
          // Add custom authentication status indicator
          const token = localStorage.getItem('jwtToken');
          if (token) {
            const authStatus = document.createElement('div');
            authStatus.innerHTML = \`
              <div style="position: fixed; top: 20px; right: 20px; background: #28a745; color: white; padding: 8px 16px; border-radius: 4px; font-size: 12px; z-index: 9999;">
                🔐 Authenticated
                <button onclick="localStorage.removeItem('jwtToken'); location.reload();" style="margin-left: 8px; background: none; border: 1px solid white; color: white; padding: 2px 8px; border-radius: 2px; cursor: pointer;">Logout</button>
              </div>
            \`;
            document.body.appendChild(authStatus);
          }
        }
      });
      
      // Custom CSS injection
      const customStyle = document.createElement('style');
      customStyle.textContent = \`
        .swagger-ui .scheme-container {
          background: #f9f9f9;
          border: 1px solid #d9d9d9;
          border-radius: 4px;
          margin: 20px 0;
          padding: 15px;
        }
        .swagger-ui .auth-wrapper .auth-container h4 {
          color: #3b4151;
          font-weight: 600;
        }
        .swagger-ui .btn.authorize {
          background: #667eea;
          border-color: #667eea;
        }
        .swagger-ui .btn.authorize:hover {
          background: #5a6fd8;
          border-color: #5a6fd8;
        }
      \`;
      document.head.appendChild(customStyle);
    };
  </script>
</body>
</html>`;

  return c.html(html, 200, {
    "Cache-Control": "public, max-age=3600",
  });
});

documentationRoutes.get("/redoc", async c => {
  // Override CSP for ReDoc documentation page
  c.header(
    "Content-Security-Policy",
    "default-src 'self'; " +
      "script-src 'self' 'unsafe-inline' https://cdn.redoc.ly; " +
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
      "font-src 'self' https://fonts.gstatic.com; " +
      "img-src 'self' data: https:; " +
      "connect-src 'self'; " +
      "object-src 'none'; " +
      "media-src 'self'; " +
      "form-action 'self';",
  );

  const baseUrl = new URL(c.req.url).origin;
  const openapiUrl = `${baseUrl}/docs/openapi.yml`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>SHINE Movie Database API Documentation - ReDoc</title>
  <link href="https://fonts.googleapis.com/css?family=Montserrat:300,400,700|Roboto:300,400,700" rel="stylesheet">
  <style>
    body {
      margin: 0;
      padding: 0;
    }
    .custom-header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 30px;
      text-align: center;
    }
    .custom-header h1 {
      margin: 0;
      font-size: 2.5rem;
      font-weight: 300;
      font-family: 'Montserrat', sans-serif;
    }
    .custom-header p {
      margin: 15px 0 0 0;
      opacity: 0.9;
      font-size: 1.1rem;
      font-family: 'Roboto', sans-serif;
    }
    #redoc-container {
      margin-top: 0;
    }
  </style>
</head>
<body>
  <div class="custom-header">
    <h1>🎬 SHINE Movie Database API</h1>
    <p>Comprehensive REST API Documentation</p>
  </div>
  <div id="redoc-container"></div>
  
  <script src="https://cdn.redoc.ly/redoc/v2.1.5/bundles/redoc.standalone.js"></script>
  <script>
    Redoc.init('${openapiUrl}', {
      scrollYOffset: 0,
      hideHostname: false,
      hideDownloadButton: false,
      theme: {
        colors: {
          primary: {
            main: '#667eea'
          }
        },
        typography: {
          fontSize: '14px',
          lineHeight: '1.5em',
          code: {
            fontSize: '13px',
            fontFamily: 'Monaco, Consolas, "Liberation Mono", "Courier New", monospace' // cspell:disable-line
          },
          headings: {
            fontFamily: 'Montserrat, sans-serif',
            fontWeight: '600'
          }
        },
        sidebar: {
          width: '280px',
          backgroundColor: '#fafafa'
        }
      }
    }, document.getElementById('redoc-container'));
  </script>
</body>
</html>`;

  return c.html(html, 200, {
    "Cache-Control": "public, max-age=3600",
  });
});

export { documentationRoutes };
