import mysql from "mysql2";
import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = process.env.PORT;

app.use(cors());
app.use(bodyParser.json());
app.use(express.static("public"));

const db = mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

db.connect((err) => {
  if (err) {
    console.error("Database connection failed", err);
    return;
  }
  console.log("Database Connected");
});

app.get("/api/polling-unit/:id", (req, res) => {
  const pollingUnit = req.params.id;

  const query = `
SELECT 
    pu.polling_unit_name,
    apr.party_abbreviation,
    apr.party_score
FROM 
    polling_unit pu
JOIN 
    announced_pu_results apr ON pu.uniqueid = apr.polling_unit_uniqueid
WHERE 
    pu.uniqueid = ?;
  `;

  db.query(query, [pollingUnit], (err, results) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(results);
  });
});

app.get("/api/lgas", (req, res) => {
  const query = "SELECT lga_id, lga_name FROM lga";
  db.query(query, (err, results) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(results);
    // console.log("LGAs fetched successfully:", results);
  });
});

app.get("/api/lga-results/:lgaId", (req, res) => {
  const lgaId = req.params.lgaId;
  const query = `
SELECT 
    l.lga_name, 
    apr.party_abbreviation, 
    SUM(apr.party_score) AS total_score
FROM 
    announced_pu_results apr
JOIN 
    polling_unit pu ON apr.polling_unit_uniqueid = pu.uniqueid
JOIN 
    lga l ON pu.lga_id = l.lga_id
WHERE 
    l.lga_id = ?
GROUP BY
    l.lga_name, apr.party_abbreviation
LIMIT 0, 1000;
    `;
  db.query(query, [lgaId], (err, results) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(results);
  });
});

app.post("/api/add-results", (req, res) => {
  const { results } = req.body; // Expecting an object with party results

  const queries = results.map((party) => {
    return {
      sql: `
                INSERT INTO announced_pu_results (polling_unit_uniqueid, party_abbreviation, party_score, entered_by_user, date_entered, user_ip_address)
                VALUES (?, ?, ?, ?, NOW(), ?)
            `,
      values: [
        parseInt(party.pollingUnitId),
        party.name,
        party.score,
        party.entered_by_user,
        party.user_ip_address,
      ],
    };
  });

  db.beginTransaction((err) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }

    let queryCount = 0;

    queries.forEach((query) => {
      db.query(query.sql, query.values, (error) => {
        if (error) {
          return db.rollback(() => {
            res.status(500).json({ error: error.message });
          });
        }
        queryCount++;
        // Check if all queries are executed
        if (queryCount === queries.length) {
          db.commit((err) => {
            if (err) {
              return db.rollback(() => {
                res.status(500).json({ error: err.message });
              });
            }
            res.json({ message: "Results added successfully" });
          });
        }
      });
    });
  });
});

app.listen(PORT, () => {
  console.log(`Server is runnig on PORT: ${PORT}`);
});
