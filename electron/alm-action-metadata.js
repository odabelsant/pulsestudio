function toActionAlmConnection(connection) {
  if (
    !connection ||
    typeof connection.id !== "string" ||
    typeof connection.name !== "string" ||
    (connection.platform !== "azure-devops" && connection.platform !== "jira" && connection.platform !== "trello")
  ) {
    return null;
  }
  return {
    id: connection.id,
    platform: connection.platform,
    name: connection.name,
    status: typeof connection.token === "string" && connection.token
      ? "configured"
      : "needs-credentials",
    capabilities: [],
  };
}

module.exports = { toActionAlmConnection };
