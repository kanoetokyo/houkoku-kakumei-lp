"use strict";

const { createHandlers } = require("./_lib/blog/handlers");
const { getStoreFromEnv } = require("./_lib/blog/notion");

module.exports = createHandlers(getStoreFromEnv).feed;
