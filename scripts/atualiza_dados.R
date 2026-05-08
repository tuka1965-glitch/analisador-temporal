install.packages(
  c("BrazilCrime", "dplyr", "readr"),
  repos = c("https://cran.r-universe.dev", "https://cloud.r-project.org")
)

library(BrazilCrime)
library(dplyr)
library(readr)

dados <- BrazilCrime::get_sinesp_vde_data(
  state = "all",
  city = "all",
  year = "all",
  category = "all",
  typology = "all",
  granularity = "month"
)

dir.create("data", showWarnings = FALSE)

write_csv(dados, "data/sinesp_vde_bruto.csv")
