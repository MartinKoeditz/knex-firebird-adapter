// Support for Knex's `fetchAsString` option.
//
// The option follows Knex's Oracle client (knex/lib/dialects/oracledb, see
// https://knexjs.org/guide/#fetchasstring): a top-level array of type names,
// matched case-insensitively; non-string entries are ignored and unsupported
// types only log a warning instead of failing. Oracle's "NUMBER", "DATE" and
// "CLOB" are supported, so these parts of an Oracle configuration work
// unchanged; Oracle's "BUFFER" has no counterpart here and only warns.
//
// Unlike Oracle, where the driver converts the values, this adapter converts
// them itself after fetching. node-firebird-driver already reads all integer,
// NUMERIC/DECIMAL and FLOAT columns as double precision, so "number" returns
// that value as a string; it does not restore precision beyond a double.

// Firebird SQL types, as reported by the driver's output metadata.
const SQL_TIMESTAMP = 510;
const SQL_TYPE_TIME = 560;
const SQL_TYPE_DATE = 570;
const SQL_TIMESTAMP_TZ_EX = 32748;
const SQL_TIME_TZ_EX = 32750;

const BLOB_SUB_TYPE_TEXT = 1;

// fetchAsString type name -> option key; "CLOB" mirrors the Oracle client.
const SUPPORTED_TYPES = {
  TEXTBLOB: "textBlob",
  CLOB: "textBlob",
  NUMBER: "number",
  DATE: "date",
};

/**
 * Parses the `fetchAsString` config into `{ textBlob, number, date }` flags,
 * or `null` when nothing is to be converted.
 */
export function parseFetchAsString(types, logger) {
  if (!Array.isArray(types)) {
    return null;
  }

  const options = { textBlob: false, number: false, date: false };
  for (const type of types) {
    if (typeof type !== "string") {
      continue;
    }
    const key = SUPPORTED_TYPES[type.toUpperCase()];
    if (key) {
      options[key] = true;
    } else {
      logger.warn(
        `Unsupported fetchAsString type "${type}": only "textblob" (alias "clob"), "number" and "date" are supported`,
      );
    }
  }

  return options.textBlob || options.number || options.date ? options : null;
}

/** Whether a result column with the given metadata is a text blob. */
export function isTextBlobColumn(column) {
  return column.subType === BLOB_SUB_TYPE_TEXT;
}

const pad = (value, length = 2) => String(value).padStart(length, "0");

const formatDate = (year, month, day) => `${year}-${pad(month)}-${pad(day)}`;
const formatTime = (hours, minutes, seconds, milliseconds) =>
  `${pad(hours)}:${pad(minutes)}:${pad(seconds)}.${pad(milliseconds, 3)}`;

// Dates/times use local components, the way the driver builds the Date objects.
const formatLocalDate = (d) =>
  formatDate(d.getFullYear(), d.getMonth() + 1, d.getDate());
const formatLocalTime = (d) =>
  formatTime(d.getHours(), d.getMinutes(), d.getSeconds(), d.getMilliseconds());

// Zoned values carry the UTC instant plus the zone's offset in minutes;
// shifting by the offset yields the zone's wall-clock time in UTC components.
const shiftToZone = ({ date, offset }) =>
  new Date(date.getTime() + offset * 60000);
const formatZonedDate = (d) =>
  formatDate(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
const formatZonedTime = (d) =>
  formatTime(
    d.getUTCHours(),
    d.getUTCMinutes(),
    d.getUTCSeconds(),
    d.getUTCMilliseconds(),
  );

/**
 * Formats a date/time value like Firebird's own string conversion, with
 * millisecond precision: "2026-10-07", "13:45:30.123",
 * "2026-10-07 13:45:30.123", "2026-10-07 13:45:30.123 Europe/Berlin".
 * Returns `undefined` for columns that are not date/time columns.
 */
export function formatDateValue(type, value) {
  switch (type) {
    case SQL_TYPE_DATE:
      return formatLocalDate(value);
    case SQL_TYPE_TIME:
      return formatLocalTime(value);
    case SQL_TIMESTAMP:
      return `${formatLocalDate(value)} ${formatLocalTime(value)}`;
    case SQL_TIME_TZ_EX:
      return `${formatZonedTime(shiftToZone(value))} ${value.timeZone}`;
    case SQL_TIMESTAMP_TZ_EX: {
      const zoned = shiftToZone(value);
      const dateTime = `${formatZonedDate(zoned)} ${formatZonedTime(zoned)}`;
      return `${dateTime} ${value.timeZone}`;
    }
    default:
      return undefined;
  }
}
