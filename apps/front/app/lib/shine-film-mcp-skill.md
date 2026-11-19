---
name: shine-film-mcp
description: Look up award-winning and nominated films, award results by ceremony year, and whether a film can be watched in Japan, using the read-only SHINE (shine-film.com) MCP server. Use for questions about film awards such as the Academy Awards, Cannes, Venice, Berlin, the Japan Academy Film Prize and Kinema Junpo, and about streaming or rental availability in Japan.
---

# SHINE MCP server

SHINE (https://shine-film.com) is a Japanese database of films that won or were nominated for major film awards and curated film lists. Its MCP server is read-only and needs no authentication.

- Endpoint: `https://shine-film.com/mcp` (Streamable HTTP, stateless; JSON-RPC batches are rejected)
- Server Card: `https://shine-film.com/mcp/server-card`
- Human-readable guide (Japanese): https://shine-film.com/developers

The server is best-effort. Tool names, arguments and response shapes may change without notice, so read the tool list (`tools/list`) at connection time instead of relying on this file.

## Tools

| Tool             | Use it to                                                                                                                                                                                                                                                           |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `search_movies`  | Find movies by Japanese or original title (`query`, at least 2 characters). Returns up to 10 movies, oldest first, with their major awards and Japan availability. People's names are not searched.                                                                 |
| `get_movie`      | Get one movie by `uid`: awards and nominations, director and top-billed cast, synopsis, and Japan availability with the confirmed sources.                                                                                                                          |
| `list_awards`    | List the awards and film lists SHINE covers, with their `slug`. Only awards with `hasYearPages: true` can be passed to `get_award_year`.                                                                                                                            |
| `get_award_year` | Get the winners and nominees of one award (`slug`) in one ceremony year (`year`), with Japan availability for each movie and a summary count. Returns at most 50 movies. `year` is the ceremony year, which can differ from the movie's release year (`movieYear`). |

Every tool takes an optional `locale`: `ja` (default) or `en`. `en` returns English titles and names where SHINE has them (most complete in `get_movie`); elsewhere many titles and award names stay Japanese. Every response includes `url` fields pointing to the matching page on shine-film.com. Link to those pages when you show results to a person.

## Japan availability

`japanAvailability` (in `get_movie`, `japanAvailability.status`) is one of:

- `watchable`: streaming or rental in Japan was confirmed by at least one source other than TSUTAYA DISCAS.
- `rental_only`: only TSUTAYA DISCAS mail rental matched. That match can be a different film with a similar title, so tell the person it needs checking.
- `unwatchable`: a check found it unavailable and none found it available.
- `unchecked`: SHINE has not checked this movie yet. Do not read it as unavailable.

Availability is a snapshot from SHINE's periodic checks, not live data.

## Typical flows

Award results for a year, then details of one film:

1. `list_awards` and pick the `slug` (for example `academy-best-picture`) with `hasYearPages: true`.
2. `get_award_year` with that `slug` and the ceremony `year`.
3. `get_movie` with a `uid` from the result.

A film the person names:

1. `search_movies` with the title. Try the Japanese title if the original title finds nothing, and the reverse.
2. `get_movie` with the `uid` of the right match (check `year`).

## Limits

- Requests are rate limited per IP. On HTTP 429, wait and retry later.
- The server may return HTTP 503 while it is switched off.
- Data comes from TMDb, Wikipedia and other public sources and can contain mistakes. Report them at https://github.com/dlwr/shine/issues.
