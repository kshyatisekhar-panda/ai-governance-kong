local typedefs = require "kong.db.schema.typedefs"

return {
  name = "prompt-shield",
  fields = {
    { consumer = typedefs.no_consumer },
    { protocols = typedefs.protocols_http },
    { config = {
        type = "record",
        fields = {
          { backend_events_url = { type = "string", default = "http://host.docker.internal:8001/admin/kong-events" } },
          { internal_secret = { type = "string", default = "kong_secret" } }
        },
      },
    },
  },
}
