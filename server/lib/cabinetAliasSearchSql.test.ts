import { MySqlDialect } from "drizzle-orm/mysql-core/dialect";
import { describe, expect, it } from "vitest";
import { cabinetAliasSearchRankSql, exactCabinetAliasOwnerSql } from "./cabinetAliasSearchSql";

const dialect = new MySqlDialect();

function render(query: Parameters<MySqlDialect["sqlToQuery"]>[0]) {
  return dialect.sqlToQuery(query);
}

describe("cabinet alias search SQL", () => {
  it("quotes the alias-master subquery and ranks an exact alias after the item code", () => {
    const { sql, params } = render(cabinetAliasSearchRankSql("BT-09"));
    expect(sql).toContain("THEN 0");
    expect(sql).toContain("THEN 1");
    expect(sql).toContain("ELSE 2");
    expect(sql).toContain("`alias_master`.`masterCode`");
    expect(sql).toContain("`alias_master`.`id`");
    expect(sql).not.toContain("alias_master.masterCode");
    expect(params).toContain("BT09");
    expect(params).toContain("%;BT09;%");
  });

  it("matches a semicolon-separated alias token without a partial code", () => {
    const { sql, params } = render(exactCabinetAliasOwnerSql("FH9"));
    expect(sql).toContain("CONCAT(';',");
    expect(params).toEqual(expect.arrayContaining(["%;FH9;%"]));
    expect(params.some((value) => value === "%FH9%")).toBe(false);
  });
});
