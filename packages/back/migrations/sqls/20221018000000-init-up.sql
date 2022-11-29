--
-- PostgreSQL database dump
--

-- Dumped from database version 14.2
-- Dumped by pg_dump version 14.2

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: citext; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS citext WITH SCHEMA public;


--
-- Name: EXTENSION citext; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION citext IS 'data type for case-insensitive character strings';


--
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;


--
-- Name: EXTENSION pgcrypto; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION pgcrypto IS 'cryptographic functions';


--
-- Name: unaccent; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA public;


--
-- Name: EXTENSION unaccent; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION unaccent IS 'text search dictionary that removes accents';


--
-- Name: uuid-ossp; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public;


--
-- Name: EXTENSION "uuid-ossp"; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION "uuid-ossp" IS 'generate universally unique identifiers (UUIDs)';


--
-- Name: email; Type: DOMAIN; Schema: public; Owner: -
--

CREATE DOMAIN public.email AS public.citext
	CONSTRAINT email_check CHECK ((VALUE OPERATOR(public.~) '^[a-zA-Z0-9.!#$%&''*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$'::public.citext));


--
-- Name: key_mode; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.key_mode AS ENUM (
    'major',
    'minor'
);


--
-- Name: key_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.key_type AS (
	chord_number integer,
	mode public.key_mode
);


--
-- Name: TYPE key_type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TYPE public.key_type IS 'Chord numbering is done according to the open key notation';


--
-- Name: preview_format; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.preview_format AS ENUM (
    'mp3',
    'mp4'
);


--
-- Name: track__artist_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.track__artist_role AS ENUM (
    'author',
    'remixer'
);


--
-- Name: track_details(integer[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.track_details(track_ids integer[]) RETURNS TABLE(track_id integer, title text, duration integer, added date, artists json, version text, labels json, remixers json, releases json, keys json, previews json, stores json, released date, published date)
    LANGUAGE sql
    AS $$
WITH
    limited_tracks AS (
        SELECT
            track_id
        FROM unnest(track_ids) AS track_id
    )
  , keys AS (
    SELECT
        lt.track_id
      , json_agg(json_build_object(
            'system', key_system_code,
            'key', key_name
        )) AS keys
    FROM
        limited_tracks lt
            NATURAL JOIN track__key
            NATURAL JOIN key_system
            NATURAL JOIN key_name
    GROUP BY 1
)
  , authors AS (
    WITH unique_authors AS (
        SELECT
            DISTINCT ON (track_id, artist_id)
            lt.track_id,
            artist_id,
            artist_name
        FROM
            limited_tracks lt
                JOIN track__artist ta ON (ta.track_id = lt.track_id AND ta.track__artist_role = 'author')
                NATURAL JOIN artist
                NATURAL LEFT JOIN store__artist
        GROUP BY 1, 2, 3
    )
    SELECT
        track_id
      , json_agg(
                json_build_object('name', artist_name, 'id', artist_id)
                ORDER BY artist_name
            ) AS authors
    FROM
        unique_authors
    GROUP BY 1
)
  , remixers AS (
    WITH unique_remixers AS (
        SELECT
            DISTINCT ON (lt.track_id, artist_id)
            lt.track_id
          , artist_id
          , artist_name
        FROM
            limited_tracks lt
                JOIN track__artist ta
                     ON (ta.track_id = lt.track_id AND ta.track__artist_role = 'remixer')
                NATURAL JOIN artist
                NATURAL LEFT JOIN store__artist
        GROUP BY 1, 2, 3
    )
    SELECT
        track_id
      , json_agg(
                json_build_object('name', artist_name, 'id', artist_id)
                ORDER BY artist_name
            ) AS remixers
    FROM unique_remixers
    GROUP BY 1
)
  , previews AS (
    WITH previews_with_grouped_waveforms AS (
        SELECT lt.track_id,
               store__track_preview_id,
               store__track_preview_format,
               store_name,
               store__track_preview_url,
               store__track_preview_end_ms - store__track_preview_start_ms,
               store__track_preview_start_ms,
               store__track_preview_end_ms,
               ARRAY_REMOVE(ARRAY_AGG(store__track_preview_waveform_url), NULL) AS waveforms
        FROM limited_tracks lt
                 NATURAL JOIN store__track
                 NATURAL JOIN store__track_preview
                 NATURAL LEFT JOIN store__track_preview_waveform
                 NATURAL JOIN store
        GROUP BY 1, 2, 3, 4, 5, 6, 7, 8
    )
    SELECT track_id
      , JSON_AGG(
                   JSON_BUILD_OBJECT(
                           'id', store__track_preview_id,
                           'format', store__track_preview_format,
                           'store', LOWER(store_name),
                           'url', store__track_preview_url,
                           'waveforms', waveforms,
                           'length_ms', store__track_preview_end_ms - store__track_preview_start_ms,
                           'start_ms', store__track_preview_start_ms,
                           'end_ms', store__track_preview_end_ms
                       )
                   ORDER BY store__track_preview_end_ms - store__track_preview_start_ms DESC NULLS LAST
               ) AS previews
    FROM previews_with_grouped_waveforms
    GROUP BY 1
)
  , store_tracks AS (
    SELECT distinct on (lt.track_id, store_id)
        track_id
      , store_id
      , store__track_id
      , store__track_released
      , store__track_published
      , store__track_url
      , store__track_bpm
      , store_name
      , store__track_store_id
      , store__release_url
    FROM
        limited_tracks lt
            NATURAL JOIN store__track
            NATURAL JOIN store
            NATURAL LEFT JOIN release__track
            NATURAL LEFT JOIN release
            NATURAL LEFT JOIN store__release
)
  , stores AS (
    SELECT
        track_id
      , min(store__track_released) as release_date
      , min(store__track_published) as publish_date
      , json_agg(
                json_build_object(
                        'name', store_name,
                        'bpm', store__track_bpm,
                        'code', lower(store_name),
                        'id', store_id,
                        'trackId', store__track_store_id,
                        'url', store__track_url,
                        'release', json_build_object('url', store__release_url)
                    )
            )                        AS stores
    FROM store_tracks
    GROUP BY 1
)
  , labels AS (
    WITH unique_labels AS (
        SELECT DISTINCT ON (track_id, label_id)
            track_id
          , label_id
          , label_name
        FROM
            limited_tracks
                NATURAL JOIN track__label
                NATURAL JOIN label
                NATURAL JOIN store__label
        GROUP BY 1, 2, 3
    )
    SELECT
        track_id
      , json_agg(
                json_build_object('name', label_name, 'id', label_id)
                ORDER BY label_name
            ) AS labels
    FROM unique_labels
    GROUP BY 1
)
  , releases AS (
    SELECT
        track_id,
        json_agg(
                json_build_object('id', release_id, 'name', release_name)
            ) AS releases
    FROM limited_tracks
             NATURAL JOIN release__track
             NATURAL JOIN release
    GROUP BY 1
)
SELECT
    track_id
  , track_title                  AS title
  , track_duration_ms            AS duration
  , track_added :: DATE          AS added
  , authors.authors              AS artists
  , track_version                AS version
  , CASE
        WHEN labels.labels IS NULL
            THEN '[]' :: JSON
        ELSE labels.labels END     AS labels
  , CASE
        WHEN remixers.remixers IS NULL
            THEN '[]' :: JSON
        ELSE remixers.remixers END AS remixers
  , CASE
        WHEN releases.releases IS NULL
            THEN '[]' :: JSON
        ELSE releases.releases END AS releases
  , CASE
        WHEN keys.keys IS NULL
            THEN '[]' :: JSON
        ELSE keys.keys END         AS keys
  , previews.previews            as previews
  , stores.stores
  , stores.release_date          AS released
  , stores.publish_date          AS published
FROM
    limited_tracks
        NATURAL JOIN track
        NATURAL JOIN authors
        NATURAL JOIN previews
        NATURAL JOIN stores
        NATURAL LEFT JOIN labels
        NATURAL LEFT JOIN remixers
        NATURAL LEFT JOIN releases
        NATURAL LEFT JOIN keys
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: artist; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.artist (
    artist_id integer NOT NULL,
    artist_name character varying(100) NOT NULL,
    artist_source integer
);


--
-- Name: artist_artist_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.artist_artist_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: artist_artist_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.artist_artist_id_seq OWNED BY public.artist.artist_id;


--
-- Name: authentication_method; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.authentication_method (
    authentication_method_id integer NOT NULL,
    authentication_method_name text NOT NULL,
    authentication_method_code text NOT NULL
);


--
-- Name: authentication_method_authentication_method_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.authentication_method_authentication_method_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: authentication_method_authentication_method_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.authentication_method_authentication_method_id_seq OWNED BY public.authentication_method.authentication_method_id;


--
-- Name: cart; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cart (
    cart_id integer NOT NULL,
    cart_name text NOT NULL,
    meta_account_user_id integer,
    cart_is_default boolean,
    cart_is_public boolean DEFAULT false NOT NULL,
    cart_uuid uuid DEFAULT public.uuid_generate_v4(),
    cart_is_purchased boolean
);


--
-- Name: cart_cart_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.cart_cart_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: cart_cart_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.cart_cart_id_seq OWNED BY public.cart.cart_id;


--
-- Name: email_queue; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_queue (
    email_queue_id integer NOT NULL,
    email_queue_sender public.email NOT NULL,
    email_queue_recipient public.email NOT NULL,
    email_queue_subject text NOT NULL,
    email_queue_plain text NOT NULL,
    email_queue_html text NOT NULL,
    email_queue_requested timestamp with time zone DEFAULT now() NOT NULL,
    email_queue_sent timestamp with time zone,
    email_queue_last_attempt timestamp with time zone,
    email_queue_last_error text,
    email_queue_attempt_count integer DEFAULT 0 NOT NULL
);


--
-- Name: email_queue_email_queue_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.email_queue_email_queue_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: email_queue_email_queue_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.email_queue_email_queue_id_seq OWNED BY public.email_queue.email_queue_id;


--
-- Name: job; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.job (
    job_id integer NOT NULL,
    job_name text NOT NULL
);


--
-- Name: job_job_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.job_job_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: job_job_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.job_job_id_seq OWNED BY public.job.job_id;


--
-- Name: job_run; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.job_run (
    job_run_id integer NOT NULL,
    job_id integer,
    job_run_started timestamp with time zone DEFAULT now() NOT NULL,
    job_run_ended timestamp with time zone,
    job_run_success boolean,
    job_run_result json
);


--
-- Name: job_run_job_run_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.job_run_job_run_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: job_run_job_run_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.job_run_job_run_id_seq OWNED BY public.job_run.job_run_id;


--
-- Name: job_schedule; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.job_schedule (
    job_id integer,
    job_schedule text NOT NULL
);


--
-- Name: key; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.key (
    key_id integer NOT NULL,
    key_key public.key_type NOT NULL
);


--
-- Name: key_key_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.key_key_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: key_key_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.key_key_id_seq OWNED BY public.key.key_id;


--
-- Name: key_name; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.key_name (
    key_name_id integer NOT NULL,
    key_id integer,
    key_system_id integer,
    key_name text NOT NULL
);


--
-- Name: key_name_key_name_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.key_name_key_name_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: key_name_key_name_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.key_name_key_name_id_seq OWNED BY public.key_name.key_name_id;


--
-- Name: key_system; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.key_system (
    key_system_id integer NOT NULL,
    key_system_code text NOT NULL,
    key_system_name text NOT NULL
);


--
-- Name: key_system_key_system_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.key_system_key_system_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: key_system_key_system_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.key_system_key_system_id_seq OWNED BY public.key_system.key_system_id;


--
-- Name: label; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.label (
    label_id integer NOT NULL,
    label_name character varying(100) NOT NULL,
    label_source integer
);


--
-- Name: label_label_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.label_label_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: label_label_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.label_label_id_seq OWNED BY public.label.label_id;


--
-- Name: meta_account; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.meta_account (
    meta_account_user_id integer NOT NULL,
    meta_account_details jsonb DEFAULT '{}'::jsonb NOT NULL
);


--
-- Name: meta_account__authentication_method_details; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.meta_account__authentication_method_details (
    meta_account__authentication_method_details_id integer NOT NULL,
    authentication_method_id integer NOT NULL,
    meta_account_user_id integer NOT NULL,
    meta_account__authentication_method_details_details jsonb NOT NULL
);


--
-- Name: meta_account__authentication__meta_account__authentication__seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.meta_account__authentication__meta_account__authentication__seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: meta_account__authentication__meta_account__authentication__seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.meta_account__authentication__meta_account__authentication__seq OWNED BY public.meta_account__authentication_method_details.meta_account__authentication_method_details_id;


--
-- Name: meta_account_email; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.meta_account_email (
    meta_account_email_id integer NOT NULL,
    meta_account_user_id integer,
    meta_account_email_address public.email NOT NULL,
    meta_account_email_verification_code uuid NOT NULL,
    meta_account_email_verified boolean DEFAULT false NOT NULL
);


--
-- Name: meta_account_email_meta_account_email_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.meta_account_email_meta_account_email_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: meta_account_email_meta_account_email_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.meta_account_email_meta_account_email_id_seq OWNED BY public.meta_account_email.meta_account_email_id;


--
-- Name: meta_account_meta_account_user_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.meta_account_meta_account_user_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: meta_account_meta_account_user_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.meta_account_meta_account_user_id_seq OWNED BY public.meta_account.meta_account_user_id;


--
-- Name: meta_operation; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.meta_operation (
    meta_operation_uuid uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    meta_operation_name text NOT NULL,
    meta_operation_created timestamp with time zone DEFAULT now() NOT NULL,
    meta_operation_finished timestamp with time zone,
    meta_operation_error boolean,
    meta_account_user_id integer NOT NULL,
    meta_operation_data jsonb
);


--
-- Name: meta_session; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.meta_session (
    sid character varying NOT NULL,
    sess jsonb NOT NULL,
    expire timestamp(6) without time zone NOT NULL
);


--
-- Name: playlist; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.playlist (
    playlist_id integer NOT NULL,
    playlist_title text NOT NULL,
    playlist_store_id text NOT NULL,
    playlist_store_details json,
    store_playlist_type_id integer,
    playlist_last_update timestamp with time zone
);


--
-- Name: playlist_playlist_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.playlist_playlist_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: playlist_playlist_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.playlist_playlist_id_seq OWNED BY public.playlist.playlist_id;


--
-- Name: release; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.release (
    release_id integer NOT NULL,
    release_name text NOT NULL,
    release_source integer
);


--
-- Name: release__track; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.release__track (
    release_id integer NOT NULL,
    track_id integer NOT NULL
);


--
-- Name: release_release_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.release_release_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: release_release_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.release_release_id_seq OWNED BY public.release.release_id;


--
-- Name: source; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.source (
    source_id integer NOT NULL,
    source_details jsonb
);


--
-- Name: source_source_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.source_source_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: source_source_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.source_source_id_seq OWNED BY public.source.source_id;


--
-- Name: store; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.store (
    store_id integer NOT NULL,
    store_name character varying(100),
    store_url text NOT NULL,
    store_artist_regex text,
    store_label_regex text
);


--
-- Name: store__artist; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.store__artist (
    store__artist_id integer NOT NULL,
    artist_id integer NOT NULL,
    store_id integer NOT NULL,
    store__artist_store_id text,
    store__artist_url text,
    store__artist_last_update timestamp with time zone,
    store__artist_source integer
);


--
-- Name: store__artist_store__artist_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.store__artist_store__artist_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: store__artist_store__artist_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.store__artist_store__artist_id_seq OWNED BY public.store__artist.store__artist_id;


--
-- Name: store__artist_watch; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.store__artist_watch (
    store__artist_watch_id integer NOT NULL,
    store__artist_id integer
);


--
-- Name: store__artist_watch__user; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.store__artist_watch__user (
    store__artist_watch_id integer,
    meta_account_user_id integer,
    store__artist_watch__user_starred boolean DEFAULT false NOT NULL,
    store__artist_watch__user_id integer NOT NULL
);


--
-- Name: store__artist_watch__user_store__artist_watch__user_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.store__artist_watch__user_store__artist_watch__user_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: store__artist_watch__user_store__artist_watch__user_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.store__artist_watch__user_store__artist_watch__user_id_seq OWNED BY public.store__artist_watch__user.store__artist_watch__user_id;


--
-- Name: store__artist_watch_store__artist_watch_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.store__artist_watch_store__artist_watch_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: store__artist_watch_store__artist_watch_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.store__artist_watch_store__artist_watch_id_seq OWNED BY public.store__artist_watch.store__artist_watch_id;


--
-- Name: store__label; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.store__label (
    store__label_id integer NOT NULL,
    label_id integer NOT NULL,
    store_id integer NOT NULL,
    store__label_store_id text NOT NULL,
    store__label_store_details jsonb,
    store__label_url text NOT NULL,
    store__label_last_update timestamp with time zone,
    store__label_source integer
);


--
-- Name: store__label_store__label_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.store__label_store__label_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: store__label_store__label_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.store__label_store__label_id_seq OWNED BY public.store__label.store__label_id;


--
-- Name: store__label_watch; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.store__label_watch (
    store__label_watch_id integer NOT NULL,
    store__label_id integer
);


--
-- Name: store__label_watch__user; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.store__label_watch__user (
    store__label_watch_id integer,
    meta_account_user_id integer,
    store__label_watch__user_starred boolean DEFAULT false NOT NULL,
    store__label_watch__user_id integer NOT NULL
);


--
-- Name: store__label_watch__user_store__label_watch__user_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.store__label_watch__user_store__label_watch__user_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: store__label_watch__user_store__label_watch__user_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.store__label_watch__user_store__label_watch__user_id_seq OWNED BY public.store__label_watch__user.store__label_watch__user_id;


--
-- Name: store__label_watch_store__label_watch_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.store__label_watch_store__label_watch_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: store__label_watch_store__label_watch_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.store__label_watch_store__label_watch_id_seq OWNED BY public.store__label_watch.store__label_watch_id;


--
-- Name: store__release; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.store__release (
    release_id integer NOT NULL,
    store_id integer NOT NULL,
    store__release_store_id text NOT NULL,
    store__release_url text NOT NULL,
    store__release_source integer
);


--
-- Name: store__track; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.store__track (
    store__track_id integer NOT NULL,
    track_id integer NOT NULL,
    store_id integer NOT NULL,
    store__track_store_id text,
    store__track_store_details jsonb NOT NULL,
    store__track_released date DEFAULT now() NOT NULL,
    store__track_published date DEFAULT now() NOT NULL,
    store__track_url text,
    store__track_source integer,
    store__track_bpm numeric
);


--
-- Name: store__track_preview; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.store__track_preview (
    store__track_preview_id integer NOT NULL,
    store__track_id integer NOT NULL,
    store__track_preview_url text,
    store__track_preview_format public.preview_format NOT NULL,
    store__track_preview_start_ms integer,
    store__track_preview_end_ms integer,
    store__track_preview_source integer
);


--
-- Name: store__track_preview_store__track_preview_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.store__track_preview_store__track_preview_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: store__track_preview_store__track_preview_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.store__track_preview_store__track_preview_id_seq OWNED BY public.store__track_preview.store__track_preview_id;


--
-- Name: store__track_preview_waveform; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.store__track_preview_waveform (
    store__track_preview_waveform_id integer NOT NULL,
    store__track_preview_id integer,
    store__track_preview_waveform_url text,
    store__track_preview_waveform_start_ms integer,
    store__track_preview_waveform_end_ms integer,
    store__track_preview_waveform_source integer
);


--
-- Name: store__track_preview_waveform_store__track_preview_waveform_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.store__track_preview_waveform_store__track_preview_waveform_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: store__track_preview_waveform_store__track_preview_waveform_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.store__track_preview_waveform_store__track_preview_waveform_seq OWNED BY public.store__track_preview_waveform.store__track_preview_waveform_id;


--
-- Name: store__track_store__track_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.store__track_store__track_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: store__track_store__track_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.store__track_store__track_id_seq OWNED BY public.store__track.store__track_id;


--
-- Name: store_playlist_type; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.store_playlist_type (
    store_playlist_type_id integer NOT NULL,
    store_id integer NOT NULL,
    store_playlist_type_regex text NOT NULL,
    store_playlist_type_store_id text,
    store_playlist_type_label text,
    store_playlist_type_priority integer DEFAULT 1 NOT NULL
);


--
-- Name: store_playlist_type_store_playlist_type_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.store_playlist_type_store_playlist_type_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: store_playlist_type_store_playlist_type_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.store_playlist_type_store_playlist_type_id_seq OWNED BY public.store_playlist_type.store_playlist_type_id;


--
-- Name: store_store_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.store_store_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: store_store_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.store_store_id_seq OWNED BY public.store.store_id;


--
-- Name: track; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.track (
    track_id integer NOT NULL,
    track_title text NOT NULL,
    track_added timestamp with time zone DEFAULT now() NOT NULL,
    track_version text,
    track_duration_ms integer,
    track_source integer
);


--
-- Name: track__artist; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.track__artist (
    track__artist_id integer NOT NULL,
    track_id integer NOT NULL,
    artist_id integer NOT NULL,
    track__artist_role public.track__artist_role DEFAULT 'author'::public.track__artist_role NOT NULL
);


--
-- Name: track__artist_track__artist_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.track__artist_track__artist_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: track__artist_track__artist_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.track__artist_track__artist_id_seq OWNED BY public.track__artist.track__artist_id;


--
-- Name: track__cart; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.track__cart (
    track__cart_id integer NOT NULL,
    cart_id integer,
    track_id integer,
    track__cart_added timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: track__cart_track__cart_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.track__cart_track__cart_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: track__cart_track__cart_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.track__cart_track__cart_id_seq OWNED BY public.track__cart.track__cart_id;


--
-- Name: track__key; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.track__key (
    track_id integer,
    key_id integer,
    track__key_source integer
);


--
-- Name: track__label; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.track__label (
    track__label_id integer NOT NULL,
    track_id integer NOT NULL,
    label_id integer NOT NULL
);


--
-- Name: track__label_track__label_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.track__label_track__label_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: track__label_track__label_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.track__label_track__label_id_seq OWNED BY public.track__label.track__label_id;


--
-- Name: track_date_added_score; Type: MATERIALIZED VIEW; Schema: public; Owner: -
--

CREATE MATERIALIZED VIEW public.track_date_added_score AS
 SELECT track.track_id,
    (date_part('days'::text, (now() - track.track_added)))::numeric AS score
   FROM public.track
  WITH NO DATA;


--
-- Name: track_date_published_score; Type: MATERIALIZED VIEW; Schema: public; Owner: -
--

CREATE MATERIALIZED VIEW public.track_date_published_score AS
 SELECT track.track_id,
    (GREATEST((0)::double precision, date_part('days'::text, (now() - (min(store__track.store__track_published))::timestamp with time zone))))::numeric AS score
   FROM (public.track
     JOIN public.store__track USING (track_id))
  GROUP BY track.track_id
  WITH NO DATA;


--
-- Name: track_date_released_score; Type: MATERIALIZED VIEW; Schema: public; Owner: -
--

CREATE MATERIALIZED VIEW public.track_date_released_score AS
 SELECT track.track_id,
    (GREATEST((0)::double precision, date_part('days'::text, (now() - (max(store__track.store__track_released))::timestamp with time zone))))::numeric AS score
   FROM (public.track
     JOIN public.store__track USING (track_id))
  GROUP BY track.track_id
  WITH NO DATA;


--
-- Name: track_track_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.track_track_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: track_track_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.track_track_id_seq OWNED BY public.track.track_id;


--
-- Name: user__artist__label_ignore; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user__artist__label_ignore (
    user__artist__label_ignore_id integer NOT NULL,
    meta_account_user_id integer,
    artist_id integer NOT NULL,
    label_id integer NOT NULL
);


--
-- Name: user__artist__label_ignore_user__artist__label_ignore_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.user__artist__label_ignore_user__artist__label_ignore_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: user__artist__label_ignore_user__artist__label_ignore_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.user__artist__label_ignore_user__artist__label_ignore_id_seq OWNED BY public.user__artist__label_ignore.user__artist__label_ignore_id;


--
-- Name: user__artist_ignore; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user__artist_ignore (
    user__artist_ignore integer NOT NULL,
    artist_id integer,
    meta_account_user_id integer
);


--
-- Name: user__artist_ignore_user__artist_ignore_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.user__artist_ignore_user__artist_ignore_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: user__artist_ignore_user__artist_ignore_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.user__artist_ignore_user__artist_ignore_seq OWNED BY public.user__artist_ignore.user__artist_ignore;


--
-- Name: user__label_ignore; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user__label_ignore (
    user__label_ignore integer NOT NULL,
    label_id integer,
    meta_account_user_id integer
);


--
-- Name: user__label_ignore_user__label_ignore_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.user__label_ignore_user__label_ignore_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: user__label_ignore_user__label_ignore_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.user__label_ignore_user__label_ignore_seq OWNED BY public.user__label_ignore.user__label_ignore;


--
-- Name: user__playlist_watch; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user__playlist_watch (
    user__playlist_watch_id integer NOT NULL,
    playlist_id integer,
    meta_account_user_id integer NOT NULL,
    user__playlist_watch_starred boolean DEFAULT false NOT NULL
);


--
-- Name: user__playlist_watch_user__playlist_watch_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.user__playlist_watch_user__playlist_watch_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: user__playlist_watch_user__playlist_watch_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.user__playlist_watch_user__playlist_watch_id_seq OWNED BY public.user__playlist_watch.user__playlist_watch_id;


--
-- Name: user__release_ignore; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user__release_ignore (
    user__release_ignore integer NOT NULL,
    release_id integer,
    meta_account_user_id integer
);


--
-- Name: user__release_ignore_user__release_ignore_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.user__release_ignore_user__release_ignore_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: user__release_ignore_user__release_ignore_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.user__release_ignore_user__release_ignore_seq OWNED BY public.user__release_ignore.user__release_ignore;


--
-- Name: user__track; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user__track (
    user__track_id integer NOT NULL,
    track_id integer NOT NULL,
    meta_account_user_id integer NOT NULL,
    user__track_heard timestamp with time zone,
    user__track_source integer
);


--
-- Name: user__track_user__track_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.user__track_user__track_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: user__track_user__track_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.user__track_user__track_id_seq OWNED BY public.user__track.user__track_id;


--
-- Name: user_artist_scores; Type: MATERIALIZED VIEW; Schema: public; Owner: -
--

CREATE MATERIALIZED VIEW public.user_artist_scores AS
 SELECT track__artist.artist_id,
    cart.meta_account_user_id,
    count(*) AS user_artist_scores_score
   FROM (((public.track__artist
     JOIN public.artist USING (artist_id))
     JOIN public.track__cart USING (track_id))
     JOIN public.cart USING (cart_id))
  WHERE cart.cart_is_purchased
  GROUP BY track__artist.artist_id, cart.meta_account_user_id
  WITH NO DATA;


--
-- Name: user_label_scores; Type: MATERIALIZED VIEW; Schema: public; Owner: -
--

CREATE MATERIALIZED VIEW public.user_label_scores AS
 SELECT track__label.label_id,
    cart.meta_account_user_id,
    count(*) AS user_label_scores_score
   FROM (((public.track__label
     JOIN public.label USING (label_id))
     JOIN public.track__cart USING (track_id))
     JOIN public.cart USING (cart_id))
  WHERE cart.cart_is_purchased
  GROUP BY track__label.label_id, cart.meta_account_user_id
  WITH NO DATA;


--
-- Name: user_search_notification; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_search_notification (
    user_search_notification_id integer NOT NULL,
    meta_account_user_id integer,
    user_search_notification_string text NOT NULL,
    user_search_notification_last_update timestamp with time zone DEFAULT now() NOT NULL,
    user_search_notification_tracks bigint[]
);


--
-- Name: user_search_notification_user_search_notification_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.user_search_notification_user_search_notification_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: user_search_notification_user_search_notification_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.user_search_notification_user_search_notification_id_seq OWNED BY public.user_search_notification.user_search_notification_id;


--
-- Name: user_track_score_weight; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_track_score_weight (
    user_track_score_weight_id integer NOT NULL,
    user_track_score_weight_multiplier double precision NOT NULL,
    user_track_score_weight_code text NOT NULL,
    meta_account_user_id integer
);


--
-- Name: user_track_score_weight_user_track_score_weight_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.user_track_score_weight_user_track_score_weight_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: user_track_score_weight_user_track_score_weight_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.user_track_score_weight_user_track_score_weight_id_seq OWNED BY public.user_track_score_weight.user_track_score_weight_id;


--
-- Name: artist artist_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.artist ALTER COLUMN artist_id SET DEFAULT nextval('public.artist_artist_id_seq'::regclass);


--
-- Name: authentication_method authentication_method_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.authentication_method ALTER COLUMN authentication_method_id SET DEFAULT nextval('public.authentication_method_authentication_method_id_seq'::regclass);


--
-- Name: cart cart_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cart ALTER COLUMN cart_id SET DEFAULT nextval('public.cart_cart_id_seq'::regclass);


--
-- Name: email_queue email_queue_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_queue ALTER COLUMN email_queue_id SET DEFAULT nextval('public.email_queue_email_queue_id_seq'::regclass);


--
-- Name: job job_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.job ALTER COLUMN job_id SET DEFAULT nextval('public.job_job_id_seq'::regclass);


--
-- Name: job_run job_run_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.job_run ALTER COLUMN job_run_id SET DEFAULT nextval('public.job_run_job_run_id_seq'::regclass);


--
-- Name: key key_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.key ALTER COLUMN key_id SET DEFAULT nextval('public.key_key_id_seq'::regclass);


--
-- Name: key_name key_name_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.key_name ALTER COLUMN key_name_id SET DEFAULT nextval('public.key_name_key_name_id_seq'::regclass);


--
-- Name: key_system key_system_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.key_system ALTER COLUMN key_system_id SET DEFAULT nextval('public.key_system_key_system_id_seq'::regclass);


--
-- Name: label label_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.label ALTER COLUMN label_id SET DEFAULT nextval('public.label_label_id_seq'::regclass);


--
-- Name: meta_account meta_account_user_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meta_account ALTER COLUMN meta_account_user_id SET DEFAULT nextval('public.meta_account_meta_account_user_id_seq'::regclass);


--
-- Name: meta_account__authentication_method_details meta_account__authentication_method_details_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meta_account__authentication_method_details ALTER COLUMN meta_account__authentication_method_details_id SET DEFAULT nextval('public.meta_account__authentication__meta_account__authentication__seq'::regclass);


--
-- Name: meta_account_email meta_account_email_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meta_account_email ALTER COLUMN meta_account_email_id SET DEFAULT nextval('public.meta_account_email_meta_account_email_id_seq'::regclass);


--
-- Name: playlist playlist_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.playlist ALTER COLUMN playlist_id SET DEFAULT nextval('public.playlist_playlist_id_seq'::regclass);


--
-- Name: release release_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.release ALTER COLUMN release_id SET DEFAULT nextval('public.release_release_id_seq'::regclass);


--
-- Name: source source_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.source ALTER COLUMN source_id SET DEFAULT nextval('public.source_source_id_seq'::regclass);


--
-- Name: store store_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.store ALTER COLUMN store_id SET DEFAULT nextval('public.store_store_id_seq'::regclass);


--
-- Name: store__artist store__artist_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.store__artist ALTER COLUMN store__artist_id SET DEFAULT nextval('public.store__artist_store__artist_id_seq'::regclass);


--
-- Name: store__artist_watch store__artist_watch_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.store__artist_watch ALTER COLUMN store__artist_watch_id SET DEFAULT nextval('public.store__artist_watch_store__artist_watch_id_seq'::regclass);


--
-- Name: store__artist_watch__user store__artist_watch__user_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.store__artist_watch__user ALTER COLUMN store__artist_watch__user_id SET DEFAULT nextval('public.store__artist_watch__user_store__artist_watch__user_id_seq'::regclass);


--
-- Name: store__label store__label_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.store__label ALTER COLUMN store__label_id SET DEFAULT nextval('public.store__label_store__label_id_seq'::regclass);


--
-- Name: store__label_watch store__label_watch_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.store__label_watch ALTER COLUMN store__label_watch_id SET DEFAULT nextval('public.store__label_watch_store__label_watch_id_seq'::regclass);


--
-- Name: store__label_watch__user store__label_watch__user_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.store__label_watch__user ALTER COLUMN store__label_watch__user_id SET DEFAULT nextval('public.store__label_watch__user_store__label_watch__user_id_seq'::regclass);


--
-- Name: store__track store__track_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.store__track ALTER COLUMN store__track_id SET DEFAULT nextval('public.store__track_store__track_id_seq'::regclass);


--
-- Name: store__track_preview store__track_preview_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.store__track_preview ALTER COLUMN store__track_preview_id SET DEFAULT nextval('public.store__track_preview_store__track_preview_id_seq'::regclass);


--
-- Name: store__track_preview_waveform store__track_preview_waveform_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.store__track_preview_waveform ALTER COLUMN store__track_preview_waveform_id SET DEFAULT nextval('public.store__track_preview_waveform_store__track_preview_waveform_seq'::regclass);


--
-- Name: store_playlist_type store_playlist_type_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.store_playlist_type ALTER COLUMN store_playlist_type_id SET DEFAULT nextval('public.store_playlist_type_store_playlist_type_id_seq'::regclass);


--
-- Name: track track_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.track ALTER COLUMN track_id SET DEFAULT nextval('public.track_track_id_seq'::regclass);


--
-- Name: track__artist track__artist_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.track__artist ALTER COLUMN track__artist_id SET DEFAULT nextval('public.track__artist_track__artist_id_seq'::regclass);


--
-- Name: track__cart track__cart_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.track__cart ALTER COLUMN track__cart_id SET DEFAULT nextval('public.track__cart_track__cart_id_seq'::regclass);


--
-- Name: track__label track__label_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.track__label ALTER COLUMN track__label_id SET DEFAULT nextval('public.track__label_track__label_id_seq'::regclass);


--
-- Name: user__artist__label_ignore user__artist__label_ignore_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user__artist__label_ignore ALTER COLUMN user__artist__label_ignore_id SET DEFAULT nextval('public.user__artist__label_ignore_user__artist__label_ignore_id_seq'::regclass);


--
-- Name: user__artist_ignore user__artist_ignore; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user__artist_ignore ALTER COLUMN user__artist_ignore SET DEFAULT nextval('public.user__artist_ignore_user__artist_ignore_seq'::regclass);


--
-- Name: user__label_ignore user__label_ignore; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user__label_ignore ALTER COLUMN user__label_ignore SET DEFAULT nextval('public.user__label_ignore_user__label_ignore_seq'::regclass);


--
-- Name: user__playlist_watch user__playlist_watch_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user__playlist_watch ALTER COLUMN user__playlist_watch_id SET DEFAULT nextval('public.user__playlist_watch_user__playlist_watch_id_seq'::regclass);


--
-- Name: user__release_ignore user__release_ignore; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user__release_ignore ALTER COLUMN user__release_ignore SET DEFAULT nextval('public.user__release_ignore_user__release_ignore_seq'::regclass);


--
-- Name: user__track user__track_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user__track ALTER COLUMN user__track_id SET DEFAULT nextval('public.user__track_user__track_id_seq'::regclass);


--
-- Name: user_search_notification user_search_notification_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_search_notification ALTER COLUMN user_search_notification_id SET DEFAULT nextval('public.user_search_notification_user_search_notification_id_seq'::regclass);


--
-- Name: user_track_score_weight user_track_score_weight_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_track_score_weight ALTER COLUMN user_track_score_weight_id SET DEFAULT nextval('public.user_track_score_weight_user_track_score_weight_id_seq'::regclass);


--
-- Data for Name: artist; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: authentication_method; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.authentication_method VALUES (1, 'e-mail login', 'email');
INSERT INTO public.authentication_method VALUES (2, 'OIDC', 'oidc');
INSERT INTO public.authentication_method VALUES (3, 'Telegram bot login', 'telegram-bot');


--
-- Data for Name: cart; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.cart VALUES (1, 'Default', 1, true, false, '3a22c964-0329-4957-a2e6-9eb9bc357d69', NULL);
INSERT INTO public.cart VALUES (2, 'Purchased', 1, NULL, false, '512600bc-d325-41cd-95cb-ac6d64759e48', true);


--
-- Data for Name: email_queue; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: job; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.job VALUES (1, 'updateJobs');
INSERT INTO public.job VALUES (2, 'updateDateAddedScore');
INSERT INTO public.job VALUES (3, 'updateDateReleasedScore');
INSERT INTO public.job VALUES (4, 'fetchBeatportWatches');
INSERT INTO public.job VALUES (5, 'fetchSpotifyWatches');
INSERT INTO public.job VALUES (6, 'fetchBandcampWatches');
INSERT INTO public.job VALUES (7, 'sendNextEmailBatch');
INSERT INTO public.job VALUES (8, 'updateNotifications');
INSERT INTO public.job VALUES (9, 'updateDatePublishedScore');
INSERT INTO public.job VALUES (10, 'updatePurchasedScores');


--
-- Data for Name: job_run; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: job_schedule; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.job_schedule VALUES (1, '*/10 * * * *');
INSERT INTO public.job_schedule VALUES (4, '*/10 * * * *');
INSERT INTO public.job_schedule VALUES (5, '* * * * *');
INSERT INTO public.job_schedule VALUES (6, '*/10 * * * *');
INSERT INTO public.job_schedule VALUES (7, '* * * * *');
INSERT INTO public.job_schedule VALUES (8, '*/30 * * * *');
INSERT INTO public.job_schedule VALUES (10, '15 * * * *');
INSERT INTO public.job_schedule VALUES (2, '*/10 * * * *');
INSERT INTO public.job_schedule VALUES (3, '*/10 * * * *');
INSERT INTO public.job_schedule VALUES (9, '*/10 * * * *');


--
-- Data for Name: key; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.key VALUES (1, '(1,major)');
INSERT INTO public.key VALUES (2, '(2,major)');
INSERT INTO public.key VALUES (3, '(3,major)');
INSERT INTO public.key VALUES (4, '(4,major)');
INSERT INTO public.key VALUES (5, '(5,major)');
INSERT INTO public.key VALUES (6, '(6,major)');
INSERT INTO public.key VALUES (7, '(7,major)');
INSERT INTO public.key VALUES (8, '(8,major)');
INSERT INTO public.key VALUES (9, '(9,major)');
INSERT INTO public.key VALUES (10, '(10,major)');
INSERT INTO public.key VALUES (11, '(11,major)');
INSERT INTO public.key VALUES (12, '(12,major)');
INSERT INTO public.key VALUES (13, '(1,minor)');
INSERT INTO public.key VALUES (14, '(2,minor)');
INSERT INTO public.key VALUES (15, '(3,minor)');
INSERT INTO public.key VALUES (16, '(4,minor)');
INSERT INTO public.key VALUES (17, '(5,minor)');
INSERT INTO public.key VALUES (18, '(6,minor)');
INSERT INTO public.key VALUES (19, '(7,minor)');
INSERT INTO public.key VALUES (20, '(8,minor)');
INSERT INTO public.key VALUES (21, '(9,minor)');
INSERT INTO public.key VALUES (22, '(10,minor)');
INSERT INTO public.key VALUES (23, '(11,minor)');
INSERT INTO public.key VALUES (24, '(12,minor)');


--
-- Data for Name: key_name; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.key_name VALUES (1, 1, 1, '1m');
INSERT INTO public.key_name VALUES (2, 2, 1, '2m');
INSERT INTO public.key_name VALUES (3, 3, 1, '3m');
INSERT INTO public.key_name VALUES (4, 4, 1, '4m');
INSERT INTO public.key_name VALUES (5, 5, 1, '5m');
INSERT INTO public.key_name VALUES (6, 6, 1, '6m');
INSERT INTO public.key_name VALUES (7, 7, 1, '7m');
INSERT INTO public.key_name VALUES (8, 8, 1, '8m');
INSERT INTO public.key_name VALUES (9, 9, 1, '9m');
INSERT INTO public.key_name VALUES (10, 10, 1, '10m');
INSERT INTO public.key_name VALUES (11, 11, 1, '11m');
INSERT INTO public.key_name VALUES (12, 12, 1, '12m');
INSERT INTO public.key_name VALUES (13, 13, 1, '1d');
INSERT INTO public.key_name VALUES (14, 14, 1, '2d');
INSERT INTO public.key_name VALUES (15, 15, 1, '3d');
INSERT INTO public.key_name VALUES (16, 16, 1, '4d');
INSERT INTO public.key_name VALUES (17, 17, 1, '5d');
INSERT INTO public.key_name VALUES (18, 18, 1, '6d');
INSERT INTO public.key_name VALUES (19, 19, 1, '7d');
INSERT INTO public.key_name VALUES (20, 20, 1, '8d');
INSERT INTO public.key_name VALUES (21, 21, 1, '9d');
INSERT INTO public.key_name VALUES (22, 22, 1, '10d');
INSERT INTO public.key_name VALUES (23, 23, 1, '11d');
INSERT INTO public.key_name VALUES (24, 24, 1, '12d');
INSERT INTO public.key_name VALUES (25, 1, 2, '8A');
INSERT INTO public.key_name VALUES (26, 2, 2, '9A');
INSERT INTO public.key_name VALUES (27, 3, 2, '10A');
INSERT INTO public.key_name VALUES (28, 4, 2, '11A');
INSERT INTO public.key_name VALUES (29, 5, 2, '12A');
INSERT INTO public.key_name VALUES (30, 6, 2, '1A');
INSERT INTO public.key_name VALUES (31, 7, 2, '2A');
INSERT INTO public.key_name VALUES (32, 8, 2, '3A');
INSERT INTO public.key_name VALUES (33, 9, 2, '4A');
INSERT INTO public.key_name VALUES (34, 10, 2, '5A');
INSERT INTO public.key_name VALUES (35, 11, 2, '6A');
INSERT INTO public.key_name VALUES (36, 12, 2, '7A');
INSERT INTO public.key_name VALUES (37, 13, 2, '8B');
INSERT INTO public.key_name VALUES (38, 14, 2, '9B');
INSERT INTO public.key_name VALUES (39, 15, 2, '10B');
INSERT INTO public.key_name VALUES (40, 16, 2, '11B');
INSERT INTO public.key_name VALUES (41, 17, 2, '12B');
INSERT INTO public.key_name VALUES (42, 18, 2, '1B');
INSERT INTO public.key_name VALUES (43, 19, 2, '2B');
INSERT INTO public.key_name VALUES (44, 20, 2, '3B');
INSERT INTO public.key_name VALUES (45, 21, 2, '4B');
INSERT INTO public.key_name VALUES (46, 22, 2, '5B');
INSERT INTO public.key_name VALUES (47, 23, 2, '6B');
INSERT INTO public.key_name VALUES (48, 24, 2, '7B');
INSERT INTO public.key_name VALUES (49, 13, 3, 'C maj');
INSERT INTO public.key_name VALUES (50, 14, 3, 'G maj');
INSERT INTO public.key_name VALUES (51, 15, 3, 'D maj');
INSERT INTO public.key_name VALUES (52, 16, 3, 'A maj');
INSERT INTO public.key_name VALUES (53, 17, 3, 'E maj');
INSERT INTO public.key_name VALUES (54, 18, 3, 'B maj');
INSERT INTO public.key_name VALUES (55, 19, 3, 'F♯ maj');
INSERT INTO public.key_name VALUES (56, 19, 3, 'G♭ maj');
INSERT INTO public.key_name VALUES (57, 20, 3, 'C♯ maj');
INSERT INTO public.key_name VALUES (58, 20, 3, 'D♭ maj');
INSERT INTO public.key_name VALUES (59, 21, 3, 'G♯ maj');
INSERT INTO public.key_name VALUES (60, 21, 3, 'A♭ maj');
INSERT INTO public.key_name VALUES (61, 22, 3, 'D♯ maj');
INSERT INTO public.key_name VALUES (62, 22, 3, 'E♭ maj');
INSERT INTO public.key_name VALUES (63, 23, 3, 'A♯ maj');
INSERT INTO public.key_name VALUES (64, 23, 3, 'B♭ maj');
INSERT INTO public.key_name VALUES (65, 24, 3, 'F maj');
INSERT INTO public.key_name VALUES (66, 1, 3, 'A min');
INSERT INTO public.key_name VALUES (67, 2, 3, 'E min');
INSERT INTO public.key_name VALUES (68, 3, 3, 'B min');
INSERT INTO public.key_name VALUES (69, 4, 3, 'F♯ min');
INSERT INTO public.key_name VALUES (70, 4, 3, 'G♭ min');
INSERT INTO public.key_name VALUES (71, 5, 3, 'C♯ min');
INSERT INTO public.key_name VALUES (72, 5, 3, 'D♭ min');
INSERT INTO public.key_name VALUES (73, 6, 3, 'G♯ min');
INSERT INTO public.key_name VALUES (74, 6, 3, 'A♭ min');
INSERT INTO public.key_name VALUES (75, 7, 3, 'D♯ min');
INSERT INTO public.key_name VALUES (76, 7, 3, 'E♭ min');
INSERT INTO public.key_name VALUES (77, 8, 3, 'A♯ min');
INSERT INTO public.key_name VALUES (78, 8, 3, 'B♭ min');
INSERT INTO public.key_name VALUES (79, 9, 3, 'F min');
INSERT INTO public.key_name VALUES (80, 10, 3, 'C min');
INSERT INTO public.key_name VALUES (81, 11, 3, 'G min');
INSERT INTO public.key_name VALUES (82, 12, 3, 'D min');


--
-- Data for Name: key_system; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.key_system VALUES (1, 'open-key', 'Open key notation');
INSERT INTO public.key_system VALUES (2, 'camelot', 'Camelot');
INSERT INTO public.key_system VALUES (3, 'diatonic', 'Diatonic keys');


--
-- Data for Name: label; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: meta_account; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.meta_account VALUES (1, '{}');


--
-- Data for Name: meta_account__authentication_method_details; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.meta_account__authentication_method_details VALUES (1, 1, 1, '{"password": "$2a$08$ZTEP8TbuPcgAkEvXJzbX3u1ZqE.cFIfZ9ZFwNMFZLDiM4cQ8JEsPS", "username": "testuser"}');


--
-- Data for Name: meta_account_email; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: meta_operation; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: meta_session; Type: TABLE DATA; Schema: public; Owner: -
--


--
-- Data for Name: playlist; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: release; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: release__track; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: source; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: store; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.store VALUES (1, 'Beatport', 'https://www.beatport.com', '^https:\/\/www\.beatport\.com\/artist\/[^/]*\/([^/]+)', '^https:\/\/www\.beatport\.com\/label\/[^/]*\/([^/]+)');
INSERT INTO public.store VALUES (2, 'Bandcamp', 'https://bandcamp.com', '^https:\/\/([^.]+)\.bandcamp\.com', '^https:\/\/([^.]+)\.bandcamp\.com');
INSERT INTO public.store VALUES (3, 'Spotify', 'https://www.spotify.com', '^https:\/\/(api|open)\.spotify\.com\/(v1\/)?artist(s?)\/([0-9A-Za-z]+)', NULL);


--
-- Data for Name: store__artist; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: store__artist_watch; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: store__artist_watch__user; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: store__label; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: store__label_watch; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: store__label_watch__user; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: store__release; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: store__track; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: store__track_preview; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: store__track_preview_waveform; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: store_playlist_type; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.store_playlist_type VALUES (1, 1, '^https:\/\/www\.beatport\.com', NULL, NULL, 1);
INSERT INTO public.store_playlist_type VALUES (2, 3, '^https:\/\/open.spotify.com\/playlist\/([0-9A-Za-z]+)', NULL, NULL, 1);
INSERT INTO public.store_playlist_type VALUES (3, 2, '^https:\/\/([^.]+)\.bandcamp\.com', NULL, NULL, 1);
INSERT INTO public.store_playlist_type VALUES (4, 2, '^https:\/\/bandcamp\.com\/tag\/([^/?]+)', 'tag', 'Tag', 1);


--
-- Data for Name: track; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: track__artist; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: track__cart; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: track__key; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: track__label; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: user__artist__label_ignore; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: user__artist_ignore; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: user__label_ignore; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: user__playlist_watch; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: user__release_ignore; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: user__track; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: user_search_notification; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: user_track_score_weight; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.user_track_score_weight VALUES (1, 1, 'label', 1);
INSERT INTO public.user_track_score_weight VALUES (2, 5, 'artist', 1);
INSERT INTO public.user_track_score_weight VALUES (3, -0.1, 'date_added', 1);
INSERT INTO public.user_track_score_weight VALUES (4, -0.1, 'date_published', 1);
INSERT INTO public.user_track_score_weight VALUES (5, 1, 'artist_follow', 1);
INSERT INTO public.user_track_score_weight VALUES (6, 1, 'label_follow', 1);
INSERT INTO public.user_track_score_weight VALUES (7, -0.1, 'date_released', 1);


--
-- Name: artist_artist_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.artist_artist_id_seq', 1, false);


--
-- Name: authentication_method_authentication_method_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.authentication_method_authentication_method_id_seq', 1, false);


--
-- Name: cart_cart_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.cart_cart_id_seq', 2, true);


--
-- Name: email_queue_email_queue_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.email_queue_email_queue_id_seq', 1, false);


--
-- Name: job_job_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.job_job_id_seq', 10, true);


--
-- Name: job_run_job_run_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.job_run_job_run_id_seq', 1, false);


--
-- Name: key_key_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.key_key_id_seq', 1, false);


--
-- Name: key_name_key_name_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.key_name_key_name_id_seq', 82, true);


--
-- Name: key_system_key_system_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.key_system_key_system_id_seq', 1, false);


--
-- Name: label_label_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.label_label_id_seq', 1, false);


--
-- Name: meta_account__authentication__meta_account__authentication__seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.meta_account__authentication__meta_account__authentication__seq', 1, true);


--
-- Name: meta_account_email_meta_account_email_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.meta_account_email_meta_account_email_id_seq', 1, false);


--
-- Name: meta_account_meta_account_user_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.meta_account_meta_account_user_id_seq', 1, true);

--
-- Name: playlist_playlist_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.playlist_playlist_id_seq', 1, false);


--
-- Name: release_release_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.release_release_id_seq', 1, false);


--
-- Name: source_source_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.source_source_id_seq', 1, false);


--
-- Name: store__artist_store__artist_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.store__artist_store__artist_id_seq', 1, false);


--
-- Name: store__artist_watch__user_store__artist_watch__user_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.store__artist_watch__user_store__artist_watch__user_id_seq', 1, false);


--
-- Name: store__artist_watch_store__artist_watch_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.store__artist_watch_store__artist_watch_id_seq', 1, false);


--
-- Name: store__label_store__label_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.store__label_store__label_id_seq', 1, false);


--
-- Name: store__label_watch__user_store__label_watch__user_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.store__label_watch__user_store__label_watch__user_id_seq', 1, false);


--
-- Name: store__label_watch_store__label_watch_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.store__label_watch_store__label_watch_id_seq', 1, false);


--
-- Name: store__track_preview_store__track_preview_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.store__track_preview_store__track_preview_id_seq', 1, false);


--
-- Name: store__track_preview_waveform_store__track_preview_waveform_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.store__track_preview_waveform_store__track_preview_waveform_seq', 1, false);


--
-- Name: store__track_store__track_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.store__track_store__track_id_seq', 1, false);


--
-- Name: store_playlist_type_store_playlist_type_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.store_playlist_type_store_playlist_type_id_seq', 4, true);


--
-- Name: store_store_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.store_store_id_seq', 3, true);


--
-- Name: track__artist_track__artist_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.track__artist_track__artist_id_seq', 1, false);


--
-- Name: track__cart_track__cart_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.track__cart_track__cart_id_seq', 1, false);


--
-- Name: track__label_track__label_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.track__label_track__label_id_seq', 1, false);


--
-- Name: track_track_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.track_track_id_seq', 1, false);


--
-- Name: user__artist__label_ignore_user__artist__label_ignore_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.user__artist__label_ignore_user__artist__label_ignore_id_seq', 1, false);


--
-- Name: user__artist_ignore_user__artist_ignore_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.user__artist_ignore_user__artist_ignore_seq', 1, false);


--
-- Name: user__label_ignore_user__label_ignore_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.user__label_ignore_user__label_ignore_seq', 1, false);


--
-- Name: user__playlist_watch_user__playlist_watch_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.user__playlist_watch_user__playlist_watch_id_seq', 1, false);


--
-- Name: user__release_ignore_user__release_ignore_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.user__release_ignore_user__release_ignore_seq', 1, false);


--
-- Name: user__track_user__track_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.user__track_user__track_id_seq', 1, false);


--
-- Name: user_search_notification_user_search_notification_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.user_search_notification_user_search_notification_id_seq', 1, false);


--
-- Name: user_track_score_weight_user_track_score_weight_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.user_track_score_weight_user_track_score_weight_id_seq', 7, true);


--
-- Name: artist artist_artist_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.artist
    ADD CONSTRAINT artist_artist_name_key UNIQUE (artist_name);


--
-- Name: artist artist_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.artist
    ADD CONSTRAINT artist_pkey PRIMARY KEY (artist_id);


--
-- Name: authentication_method authentication_method_authentication_method_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.authentication_method
    ADD CONSTRAINT authentication_method_authentication_method_code_key UNIQUE (authentication_method_code);


--
-- Name: authentication_method authentication_method_authentication_method_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.authentication_method
    ADD CONSTRAINT authentication_method_authentication_method_name_key UNIQUE (authentication_method_name);


--
-- Name: authentication_method authentication_method_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.authentication_method
    ADD CONSTRAINT authentication_method_pkey PRIMARY KEY (authentication_method_id);


--
-- Name: cart cart_cart_is_purchased_meta_account_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cart
    ADD CONSTRAINT cart_cart_is_purchased_meta_account_user_id_key UNIQUE (cart_is_purchased, meta_account_user_id);


--
-- Name: cart cart_cart_name_meta_account_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cart
    ADD CONSTRAINT cart_cart_name_meta_account_user_id_key UNIQUE (cart_name, meta_account_user_id);


--
-- Name: cart cart_meta_account_user_id_cart_is_default_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cart
    ADD CONSTRAINT cart_meta_account_user_id_cart_is_default_key UNIQUE (meta_account_user_id, cart_is_default);


--
-- Name: cart cart_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cart
    ADD CONSTRAINT cart_pkey PRIMARY KEY (cart_id);


--
-- Name: email_queue email_queue_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_queue
    ADD CONSTRAINT email_queue_pkey PRIMARY KEY (email_queue_id);


--
-- Name: job job_job_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.job
    ADD CONSTRAINT job_job_name_key UNIQUE (job_name);


--
-- Name: job job_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.job
    ADD CONSTRAINT job_pkey PRIMARY KEY (job_id);


--
-- Name: job_run job_run_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.job_run
    ADD CONSTRAINT job_run_pkey PRIMARY KEY (job_run_id);


--
-- Name: job_schedule job_schedule_job_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.job_schedule
    ADD CONSTRAINT job_schedule_job_id_key UNIQUE (job_id);


--
-- Name: key_name key_name_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.key_name
    ADD CONSTRAINT key_name_pkey PRIMARY KEY (key_name_id);


--
-- Name: key key_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.key
    ADD CONSTRAINT key_pkey PRIMARY KEY (key_id);


--
-- Name: key_system key_system_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.key_system
    ADD CONSTRAINT key_system_pkey PRIMARY KEY (key_system_id);


--
-- Name: label label_label_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.label
    ADD CONSTRAINT label_label_name_key UNIQUE (label_name);


--
-- Name: label label_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.label
    ADD CONSTRAINT label_pkey PRIMARY KEY (label_id);


--
-- Name: meta_account__authentication_method_details meta_account__authentication__meta_account__authentication__key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meta_account__authentication_method_details
    ADD CONSTRAINT meta_account__authentication__meta_account__authentication__key UNIQUE (meta_account__authentication_method_details_id, meta_account_user_id);


--
-- Name: meta_account__authentication_method_details meta_account__authentication_method_details_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meta_account__authentication_method_details
    ADD CONSTRAINT meta_account__authentication_method_details_pkey PRIMARY KEY (meta_account__authentication_method_details_id);


--
-- Name: meta_account_email meta_account_email_meta_account_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meta_account_email
    ADD CONSTRAINT meta_account_email_meta_account_user_id_key UNIQUE (meta_account_user_id);


--
-- Name: meta_account_email meta_account_email_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meta_account_email
    ADD CONSTRAINT meta_account_email_pkey PRIMARY KEY (meta_account_email_id);


--
-- Name: meta_account meta_account_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meta_account
    ADD CONSTRAINT meta_account_pkey PRIMARY KEY (meta_account_user_id);


--
-- Name: meta_operation meta_operation_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meta_operation
    ADD CONSTRAINT meta_operation_pkey PRIMARY KEY (meta_operation_uuid);


--
-- Name: meta_session meta_session_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meta_session
    ADD CONSTRAINT meta_session_pkey PRIMARY KEY (sid);


--
-- Name: playlist playlist_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.playlist
    ADD CONSTRAINT playlist_pkey PRIMARY KEY (playlist_id);


--
-- Name: release__track release__track_release_id_track_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.release__track
    ADD CONSTRAINT release__track_release_id_track_id_key UNIQUE (release_id, track_id);


--
-- Name: release release_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.release
    ADD CONSTRAINT release_pkey PRIMARY KEY (release_id);


--
-- Name: source source_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.source
    ADD CONSTRAINT source_pkey PRIMARY KEY (source_id);


--
-- Name: store__artist store__artist_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.store__artist
    ADD CONSTRAINT store__artist_pkey PRIMARY KEY (store__artist_id);


--
-- Name: store__artist store__artist_store__artist_store_id_store_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.store__artist
    ADD CONSTRAINT store__artist_store__artist_store_id_store_id_key UNIQUE (store__artist_store_id, store_id);


--
-- Name: store__artist store__artist_store__artist_url_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.store__artist
    ADD CONSTRAINT store__artist_store__artist_url_key UNIQUE (store__artist_url);


--
-- Name: store__artist_watch__user store__artist_watch__user_store__artist_watch_id_meta_accou_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.store__artist_watch__user
    ADD CONSTRAINT store__artist_watch__user_store__artist_watch_id_meta_accou_key UNIQUE (store__artist_watch_id, meta_account_user_id);


--
-- Name: store__artist_watch store__artist_watch_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.store__artist_watch
    ADD CONSTRAINT store__artist_watch_pkey PRIMARY KEY (store__artist_watch_id);


--
-- Name: store__artist_watch store__artist_watch_store__artist_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.store__artist_watch
    ADD CONSTRAINT store__artist_watch_store__artist_id_key UNIQUE (store__artist_id);


--
-- Name: store__label store__label_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.store__label
    ADD CONSTRAINT store__label_pkey PRIMARY KEY (store__label_id);


--
-- Name: store__label store__label_store__label_store_id_store_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.store__label
    ADD CONSTRAINT store__label_store__label_store_id_store_id_key UNIQUE (store__label_store_id, store_id);


--
-- Name: store__label store__label_store__label_url_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.store__label
    ADD CONSTRAINT store__label_store__label_url_key UNIQUE (store__label_url);


--
-- Name: store__label_watch__user store__label_watch__user_store__label_watch_id_meta_account_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.store__label_watch__user
    ADD CONSTRAINT store__label_watch__user_store__label_watch_id_meta_account_key UNIQUE (store__label_watch_id, meta_account_user_id);


--
-- Name: store__label_watch store__label_watch_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.store__label_watch
    ADD CONSTRAINT store__label_watch_pkey PRIMARY KEY (store__label_watch_id);


--
-- Name: store__label_watch store__label_watch_store__label_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.store__label_watch
    ADD CONSTRAINT store__label_watch_store__label_id_key UNIQUE (store__label_id);


--
-- Name: store__release store__release_store__release_url_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.store__release
    ADD CONSTRAINT store__release_store__release_url_key UNIQUE (store__release_url);


--
-- Name: store__release store__release_store_id_store__release_store_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.store__release
    ADD CONSTRAINT store__release_store_id_store__release_store_id_key UNIQUE (store_id, store__release_store_id);


--
-- Name: store__track store__track_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.store__track
    ADD CONSTRAINT store__track_pkey PRIMARY KEY (store__track_id);


--
-- Name: store__track_preview store__track_preview_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.store__track_preview
    ADD CONSTRAINT store__track_preview_pkey PRIMARY KEY (store__track_preview_id);


--
-- Name: store__track_preview store__track_preview_store__track_id_preview_url_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.store__track_preview
    ADD CONSTRAINT store__track_preview_store__track_id_preview_url_key UNIQUE (store__track_id, store__track_preview_url);


--
-- Name: store__track_preview_waveform store__track_preview_waveform_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.store__track_preview_waveform
    ADD CONSTRAINT store__track_preview_waveform_pkey PRIMARY KEY (store__track_preview_waveform_id);


--
-- Name: store__track_preview_waveform store__track_preview_waveform_store__track_preview_id_url_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.store__track_preview_waveform
    ADD CONSTRAINT store__track_preview_waveform_store__track_preview_id_url_key UNIQUE (store__track_preview_id, store__track_preview_waveform_url);


--
-- Name: store__track store__track_store__track_store_id_store_id_track_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.store__track
    ADD CONSTRAINT store__track_store__track_store_id_store_id_track_id_key UNIQUE (store__track_store_id, store_id, track_id);


--
-- Name: store__track store__track_store__track_url_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.store__track
    ADD CONSTRAINT store__track_store__track_url_key UNIQUE (store__track_url);


--
-- Name: store store_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.store
    ADD CONSTRAINT store_pkey PRIMARY KEY (store_id);


--
-- Name: store_playlist_type store_playlist_type_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.store_playlist_type
    ADD CONSTRAINT store_playlist_type_pkey PRIMARY KEY (store_playlist_type_id);


--
-- Name: store_playlist_type store_playlist_type_store_id_store_playlist_type_label_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.store_playlist_type
    ADD CONSTRAINT store_playlist_type_store_id_store_playlist_type_label_key UNIQUE (store_id, store_playlist_type_label);


--
-- Name: store_playlist_type store_playlist_type_store_id_store_playlist_type_regex_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.store_playlist_type
    ADD CONSTRAINT store_playlist_type_store_id_store_playlist_type_regex_key UNIQUE (store_id, store_playlist_type_regex);


--
-- Name: store_playlist_type store_playlist_type_store_id_store_playlist_type_store_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.store_playlist_type
    ADD CONSTRAINT store_playlist_type_store_id_store_playlist_type_store_id_key UNIQUE (store_id, store_playlist_type_store_id);


--
-- Name: track__artist track__artist_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.track__artist
    ADD CONSTRAINT track__artist_pkey PRIMARY KEY (track__artist_id);


--
-- Name: track__artist track__artist_track_id_artist_id_track__artist_role_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.track__artist
    ADD CONSTRAINT track__artist_track_id_artist_id_track__artist_role_key UNIQUE (track_id, artist_id, track__artist_role);


--
-- Name: track__cart track__cart_cart_id_track_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.track__cart
    ADD CONSTRAINT track__cart_cart_id_track_id_key UNIQUE (cart_id, track_id);


--
-- Name: track__cart track__cart_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.track__cart
    ADD CONSTRAINT track__cart_pkey PRIMARY KEY (track__cart_id);


--
-- Name: track__key track__key_track_id_key_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.track__key
    ADD CONSTRAINT track__key_track_id_key_id_key UNIQUE (track_id, key_id);


--
-- Name: track__label track__label_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.track__label
    ADD CONSTRAINT track__label_pkey PRIMARY KEY (track__label_id);


--
-- Name: track__label track__label_track_id_label_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.track__label
    ADD CONSTRAINT track__label_track_id_label_id_key UNIQUE (track_id, label_id);


--
-- Name: track track_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.track
    ADD CONSTRAINT track_pkey PRIMARY KEY (track_id);


--
-- Name: user__artist__label_ignore user__artist__label_ignore_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user__artist__label_ignore
    ADD CONSTRAINT user__artist__label_ignore_pkey PRIMARY KEY (user__artist__label_ignore_id);


--
-- Name: user__artist__label_ignore user__artist__label_ignore_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user__artist__label_ignore
    ADD CONSTRAINT user__artist__label_ignore_unique UNIQUE (meta_account_user_id, artist_id, label_id);


--
-- Name: user__artist_ignore user__artist_ignore_artist_id_meta_account_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user__artist_ignore
    ADD CONSTRAINT user__artist_ignore_artist_id_meta_account_user_id_key UNIQUE (artist_id, meta_account_user_id);


--
-- Name: user__artist_ignore user__artist_ignore_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user__artist_ignore
    ADD CONSTRAINT user__artist_ignore_pkey PRIMARY KEY (user__artist_ignore);


--
-- Name: user__label_ignore user__label_ignore_label_id_meta_account_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user__label_ignore
    ADD CONSTRAINT user__label_ignore_label_id_meta_account_user_id_key UNIQUE (label_id, meta_account_user_id);


--
-- Name: user__label_ignore user__label_ignore_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user__label_ignore
    ADD CONSTRAINT user__label_ignore_pkey PRIMARY KEY (user__label_ignore);


--
-- Name: user__playlist_watch user__playlist_watch_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user__playlist_watch
    ADD CONSTRAINT user__playlist_watch_pkey PRIMARY KEY (user__playlist_watch_id);


--
-- Name: user__playlist_watch user__playlist_watch_playlist_id_meta_account_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user__playlist_watch
    ADD CONSTRAINT user__playlist_watch_playlist_id_meta_account_user_id_key UNIQUE (playlist_id, meta_account_user_id);


--
-- Name: user__release_ignore user__release_ignore_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user__release_ignore
    ADD CONSTRAINT user__release_ignore_pkey PRIMARY KEY (user__release_ignore);


--
-- Name: user__release_ignore user__release_ignore_release_id_meta_account_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user__release_ignore
    ADD CONSTRAINT user__release_ignore_release_id_meta_account_user_id_key UNIQUE (release_id, meta_account_user_id);


--
-- Name: user__track user__track_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user__track
    ADD CONSTRAINT user__track_pkey PRIMARY KEY (user__track_id);


--
-- Name: user__track user__track_track_id_meta_account_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user__track
    ADD CONSTRAINT user__track_track_id_meta_account_user_id_key UNIQUE (track_id, meta_account_user_id);


--
-- Name: user_search_notification user_search_notification_meta_account_user_id_user_search_n_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_search_notification
    ADD CONSTRAINT user_search_notification_meta_account_user_id_user_search_n_key UNIQUE (meta_account_user_id, user_search_notification_string);


--
-- Name: user_search_notification user_search_notification_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_search_notification
    ADD CONSTRAINT user_search_notification_pkey PRIMARY KEY (user_search_notification_id);


--
-- Name: user_track_score_weight user_track_score_weight_meta_account_user_id_user_track_sco_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_track_score_weight
    ADD CONSTRAINT user_track_score_weight_meta_account_user_id_user_track_sco_key UNIQUE (meta_account_user_id, user_track_score_weight_code);


--
-- Name: user_track_score_weight user_track_score_weight_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_track_score_weight
    ADD CONSTRAINT user_track_score_weight_pkey PRIMARY KEY (user_track_score_weight_id);


--
-- Name: store__track_preview_store__track_id_expr_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX store__track_preview_store__track_id_expr_idx ON public.store__track_preview USING btree (store__track_id, ((store__track_preview_url IS NULL))) WHERE (store__track_preview_url IS NULL);


--
-- Name: artist artist_source_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.artist
    ADD CONSTRAINT artist_source_id_fkey FOREIGN KEY (artist_source) REFERENCES public.source(source_id);


--
-- Name: cart cart_meta_account_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cart
    ADD CONSTRAINT cart_meta_account_user_id_fkey FOREIGN KEY (meta_account_user_id) REFERENCES public.meta_account(meta_account_user_id);


--
-- Name: job_run job_run_job_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.job_run
    ADD CONSTRAINT job_run_job_id_fkey FOREIGN KEY (job_id) REFERENCES public.job(job_id) ON DELETE CASCADE;


--
-- Name: job_schedule job_schedule_job_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.job_schedule
    ADD CONSTRAINT job_schedule_job_id_fkey FOREIGN KEY (job_id) REFERENCES public.job(job_id) ON DELETE CASCADE;


--
-- Name: key_name key_name_key_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.key_name
    ADD CONSTRAINT key_name_key_id_fkey FOREIGN KEY (key_id) REFERENCES public.key(key_id);


--
-- Name: key_name key_name_key_system_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.key_name
    ADD CONSTRAINT key_name_key_system_id_fkey FOREIGN KEY (key_system_id) REFERENCES public.key_system(key_system_id);


--
-- Name: label label_source_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.label
    ADD CONSTRAINT label_source_id_fkey FOREIGN KEY (label_source) REFERENCES public.source(source_id);


--
-- Name: meta_account__authentication_method_details meta_account__authentication_meth_authentication_method_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meta_account__authentication_method_details
    ADD CONSTRAINT meta_account__authentication_meth_authentication_method_id_fkey FOREIGN KEY (authentication_method_id) REFERENCES public.authentication_method(authentication_method_id);


--
-- Name: meta_account__authentication_method_details meta_account__authentication_method_d_meta_account_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meta_account__authentication_method_details
    ADD CONSTRAINT meta_account__authentication_method_d_meta_account_user_id_fkey FOREIGN KEY (meta_account_user_id) REFERENCES public.meta_account(meta_account_user_id);


--
-- Name: meta_account_email meta_account_email_meta_account_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meta_account_email
    ADD CONSTRAINT meta_account_email_meta_account_user_id_fkey FOREIGN KEY (meta_account_user_id) REFERENCES public.meta_account(meta_account_user_id);


--
-- Name: meta_operation meta_operation_meta_account_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meta_operation
    ADD CONSTRAINT meta_operation_meta_account_user_id_fkey FOREIGN KEY (meta_account_user_id) REFERENCES public.meta_account(meta_account_user_id);


--
-- Name: playlist playlist_store_playlist_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.playlist
    ADD CONSTRAINT playlist_store_playlist_type_id_fkey FOREIGN KEY (store_playlist_type_id) REFERENCES public.store_playlist_type(store_playlist_type_id);


--
-- Name: release__track release__track_release_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.release__track
    ADD CONSTRAINT release__track_release_id_fkey FOREIGN KEY (release_id) REFERENCES public.release(release_id) ON DELETE CASCADE;


--
-- Name: release__track release__track_track_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.release__track
    ADD CONSTRAINT release__track_track_id_fkey FOREIGN KEY (track_id) REFERENCES public.track(track_id) ON DELETE CASCADE;


--
-- Name: release release_source_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.release
    ADD CONSTRAINT release_source_id_fkey FOREIGN KEY (release_source) REFERENCES public.source(source_id);


--
-- Name: store__artist store__artist_artist_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.store__artist
    ADD CONSTRAINT store__artist_artist_id_fkey FOREIGN KEY (artist_id) REFERENCES public.artist(artist_id) ON DELETE CASCADE;


--
-- Name: store__artist store__artist_source_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.store__artist
    ADD CONSTRAINT store__artist_source_id_fkey FOREIGN KEY (store__artist_source) REFERENCES public.source(source_id);


--
-- Name: store__artist store__artist_store_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.store__artist
    ADD CONSTRAINT store__artist_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.store(store_id);


--
-- Name: store__artist_watch__user store__artist_watch__user_meta_account_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.store__artist_watch__user
    ADD CONSTRAINT store__artist_watch__user_meta_account_user_id_fkey FOREIGN KEY (meta_account_user_id) REFERENCES public.meta_account(meta_account_user_id);


--
-- Name: store__artist_watch__user store__artist_watch__user_store__artist_watch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.store__artist_watch__user
    ADD CONSTRAINT store__artist_watch__user_store__artist_watch_id_fkey FOREIGN KEY (store__artist_watch_id) REFERENCES public.store__artist_watch(store__artist_watch_id) ON DELETE CASCADE;


--
-- Name: store__artist_watch store__artist_watch_store__artist_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.store__artist_watch
    ADD CONSTRAINT store__artist_watch_store__artist_id_fkey FOREIGN KEY (store__artist_id) REFERENCES public.store__artist(store__artist_id) ON DELETE CASCADE;


--
-- Name: store__label store__label_label_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.store__label
    ADD CONSTRAINT store__label_label_id_fkey FOREIGN KEY (label_id) REFERENCES public.label(label_id) ON DELETE CASCADE;


--
-- Name: store__label store__label_source_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.store__label
    ADD CONSTRAINT store__label_source_id_fkey FOREIGN KEY (store__label_source) REFERENCES public.source(source_id);


--
-- Name: store__label store__label_store_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.store__label
    ADD CONSTRAINT store__label_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.store(store_id);


--
-- Name: store__label_watch__user store__label_watch__user_meta_account_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.store__label_watch__user
    ADD CONSTRAINT store__label_watch__user_meta_account_user_id_fkey FOREIGN KEY (meta_account_user_id) REFERENCES public.meta_account(meta_account_user_id);


--
-- Name: store__label_watch store__label_watch__user_store__label_watch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.store__label_watch
    ADD CONSTRAINT store__label_watch__user_store__label_watch_id_fkey FOREIGN KEY (store__label_watch_id) REFERENCES public.store__label_watch(store__label_watch_id) ON DELETE CASCADE;


--
-- Name: store__label_watch store__label_watch_store__label_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.store__label_watch
    ADD CONSTRAINT store__label_watch_store__label_id_fkey FOREIGN KEY (store__label_id) REFERENCES public.store__label(store__label_id) ON DELETE CASCADE;


--
-- Name: store__release store__release_release_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.store__release
    ADD CONSTRAINT store__release_release_id_fkey FOREIGN KEY (release_id) REFERENCES public.release(release_id);


--
-- Name: store__release store__release_source_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.store__release
    ADD CONSTRAINT store__release_source_id_fkey FOREIGN KEY (store__release_source) REFERENCES public.source(source_id);


--
-- Name: store__release store__release_store_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.store__release
    ADD CONSTRAINT store__release_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.store(store_id);


--
-- Name: store__track_preview store__track_preview_source_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.store__track_preview
    ADD CONSTRAINT store__track_preview_source_id_fkey FOREIGN KEY (store__track_preview_source) REFERENCES public.source(source_id);


--
-- Name: store__track_preview store__track_preview_store__track_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.store__track_preview
    ADD CONSTRAINT store__track_preview_store__track_id_fkey FOREIGN KEY (store__track_id) REFERENCES public.store__track(store__track_id) ON DELETE CASCADE;


--
-- Name: store__track_preview_waveform store__track_preview_waveform_source_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.store__track_preview_waveform
    ADD CONSTRAINT store__track_preview_waveform_source_id_fkey FOREIGN KEY (store__track_preview_waveform_source) REFERENCES public.source(source_id);


--
-- Name: store__track_preview_waveform store__track_preview_waveform_store__track_preview_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.store__track_preview_waveform
    ADD CONSTRAINT store__track_preview_waveform_store__track_preview_id_fkey FOREIGN KEY (store__track_preview_id) REFERENCES public.store__track_preview(store__track_preview_id) ON DELETE CASCADE;


--
-- Name: store__track store__track_source_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.store__track
    ADD CONSTRAINT store__track_source_id_fkey FOREIGN KEY (store__track_source) REFERENCES public.source(source_id);


--
-- Name: store__track store__track_store_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.store__track
    ADD CONSTRAINT store__track_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.store(store_id) ON DELETE CASCADE;


--
-- Name: store__track store__track_track_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.store__track
    ADD CONSTRAINT store__track_track_id_fkey FOREIGN KEY (track_id) REFERENCES public.track(track_id) ON DELETE CASCADE;


--
-- Name: store_playlist_type store_playlist_type_store_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.store_playlist_type
    ADD CONSTRAINT store_playlist_type_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.store(store_id);


--
-- Name: track__artist track__artist_artist_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.track__artist
    ADD CONSTRAINT track__artist_artist_id_fkey FOREIGN KEY (artist_id) REFERENCES public.artist(artist_id) ON DELETE CASCADE;


--
-- Name: track__artist track__artist_track_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.track__artist
    ADD CONSTRAINT track__artist_track_id_fkey FOREIGN KEY (track_id) REFERENCES public.track(track_id) ON DELETE CASCADE;


--
-- Name: track__cart track__cart_cart_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.track__cart
    ADD CONSTRAINT track__cart_cart_id_fkey FOREIGN KEY (cart_id) REFERENCES public.cart(cart_id) ON DELETE CASCADE;


--
-- Name: track__cart track__cart_track_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.track__cart
    ADD CONSTRAINT track__cart_track_id_fkey FOREIGN KEY (track_id) REFERENCES public.track(track_id) ON DELETE CASCADE;


--
-- Name: track__key track__key_key_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.track__key
    ADD CONSTRAINT track__key_key_id_fkey FOREIGN KEY (key_id) REFERENCES public.key(key_id);


--
-- Name: track__key track__key_source_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.track__key
    ADD CONSTRAINT track__key_source_id_fkey FOREIGN KEY (track__key_source) REFERENCES public.source(source_id);


--
-- Name: track__key track__key_track_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.track__key
    ADD CONSTRAINT track__key_track_id_fkey FOREIGN KEY (track_id) REFERENCES public.track(track_id) ON DELETE CASCADE;


--
-- Name: track__label track__label_label_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.track__label
    ADD CONSTRAINT track__label_label_id_fkey FOREIGN KEY (label_id) REFERENCES public.label(label_id) ON DELETE CASCADE;


--
-- Name: track__label track__label_track_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.track__label
    ADD CONSTRAINT track__label_track_id_fkey FOREIGN KEY (track_id) REFERENCES public.track(track_id) ON DELETE CASCADE;


--
-- Name: track track_source_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.track
    ADD CONSTRAINT track_source_id_fkey FOREIGN KEY (track_source) REFERENCES public.source(source_id);


--
-- Name: user__artist__label_ignore user__artist__label_ignore_artist_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user__artist__label_ignore
    ADD CONSTRAINT user__artist__label_ignore_artist_id_fkey FOREIGN KEY (artist_id) REFERENCES public.artist(artist_id) ON DELETE CASCADE;


--
-- Name: user__artist__label_ignore user__artist__label_ignore_label_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user__artist__label_ignore
    ADD CONSTRAINT user__artist__label_ignore_label_id_fkey FOREIGN KEY (label_id) REFERENCES public.label(label_id) ON DELETE CASCADE;


--
-- Name: user__artist__label_ignore user__artist__label_ignore_meta_account_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user__artist__label_ignore
    ADD CONSTRAINT user__artist__label_ignore_meta_account_user_id_fkey FOREIGN KEY (meta_account_user_id) REFERENCES public.meta_account(meta_account_user_id) ON DELETE CASCADE;


--
-- Name: user__artist_ignore user__artist_ignore_artist_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user__artist_ignore
    ADD CONSTRAINT user__artist_ignore_artist_id_fkey FOREIGN KEY (artist_id) REFERENCES public.artist(artist_id);


--
-- Name: user__artist_ignore user__artist_ignore_meta_account_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user__artist_ignore
    ADD CONSTRAINT user__artist_ignore_meta_account_user_id_fkey FOREIGN KEY (meta_account_user_id) REFERENCES public.meta_account(meta_account_user_id);


--
-- Name: user__label_ignore user__label_ignore_label_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user__label_ignore
    ADD CONSTRAINT user__label_ignore_label_id_fkey FOREIGN KEY (label_id) REFERENCES public.label(label_id);


--
-- Name: user__label_ignore user__label_ignore_meta_account_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user__label_ignore
    ADD CONSTRAINT user__label_ignore_meta_account_user_id_fkey FOREIGN KEY (meta_account_user_id) REFERENCES public.meta_account(meta_account_user_id);


--
-- Name: user__playlist_watch user__playlist_watch_meta_account_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user__playlist_watch
    ADD CONSTRAINT user__playlist_watch_meta_account_user_id_fkey FOREIGN KEY (meta_account_user_id) REFERENCES public.meta_account(meta_account_user_id);


--
-- Name: user__playlist_watch user__playlist_watch_playlist_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user__playlist_watch
    ADD CONSTRAINT user__playlist_watch_playlist_id_fkey FOREIGN KEY (playlist_id) REFERENCES public.playlist(playlist_id) ON DELETE CASCADE;


--
-- Name: user__release_ignore user__release_ignore_meta_account_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user__release_ignore
    ADD CONSTRAINT user__release_ignore_meta_account_user_id_fkey FOREIGN KEY (meta_account_user_id) REFERENCES public.meta_account(meta_account_user_id);


--
-- Name: user__release_ignore user__release_ignore_release_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user__release_ignore
    ADD CONSTRAINT user__release_ignore_release_id_fkey FOREIGN KEY (release_id) REFERENCES public.release(release_id);


--
-- Name: user__track user__track_meta_account_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user__track
    ADD CONSTRAINT user__track_meta_account_user_id_fkey FOREIGN KEY (meta_account_user_id) REFERENCES public.meta_account(meta_account_user_id);


--
-- Name: user__track user__track_source_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user__track
    ADD CONSTRAINT user__track_source_id_fkey FOREIGN KEY (user__track_source) REFERENCES public.source(source_id);


--
-- Name: user__track user__track_track_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user__track
    ADD CONSTRAINT user__track_track_id_fkey FOREIGN KEY (track_id) REFERENCES public.track(track_id) ON DELETE CASCADE;


--
-- Name: user_search_notification user_search_notification_meta_account_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_search_notification
    ADD CONSTRAINT user_search_notification_meta_account_user_id_fkey FOREIGN KEY (meta_account_user_id) REFERENCES public.meta_account(meta_account_user_id);


--
-- Name: user_track_score_weight user_track_score_weight_meta_account_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_track_score_weight
    ADD CONSTRAINT user_track_score_weight_meta_account_user_id_fkey FOREIGN KEY (meta_account_user_id) REFERENCES public.meta_account(meta_account_user_id);


--
-- Name: track_date_added_score; Type: MATERIALIZED VIEW DATA; Schema: public; Owner: -
--

REFRESH MATERIALIZED VIEW public.track_date_added_score;


--
-- Name: track_date_published_score; Type: MATERIALIZED VIEW DATA; Schema: public; Owner: -
--

REFRESH MATERIALIZED VIEW public.track_date_published_score;


--
-- Name: track_date_released_score; Type: MATERIALIZED VIEW DATA; Schema: public; Owner: -
--

REFRESH MATERIALIZED VIEW public.track_date_released_score;


--
-- Name: user_artist_scores; Type: MATERIALIZED VIEW DATA; Schema: public; Owner: -
--

REFRESH MATERIALIZED VIEW public.user_artist_scores;


--
-- Name: user_label_scores; Type: MATERIALIZED VIEW DATA; Schema: public; Owner: -
--

REFRESH MATERIALIZED VIEW public.user_label_scores;


--
-- PostgreSQL database dump complete
--
