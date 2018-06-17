setwd("~/cuda-workspace/transmet/bedah/")
library(leaflet)
library(ncdf4)
library(raster)
library(doParallel)
library(foreach)
library(stringr)


data_prefix = "/home/yosik/cuda-workspace/mews_app/data/nc"
load("~/cuda-workspace/mews_app/polygon_function/polygon_data/kec2.Rda")
i_SULSEL = which(as.character(kec$Provinsi) ==  "SULAWESI SELATAN")
# kec = kec[i_SULSEL,]
kec$Kecamatan = str_to_title(as.character(kec$Kecamatan))
kec$Kabupaten= str_to_title(as.character(kec$Kabupaten))

nc = nc_open(paste0("/home/yosik/cuda-workspace/mews_app/data/nc/H08_B13_Indonesia_201803020320.nc"))
IR = ncvar_get(nc, "IR")
lon = ncvar_get(nc, "longitude")
lat = ncvar_get(nc, "latitude")

R_IR = raster("/home/yosik/cuda-workspace/mews_app/data/nc/H08_B13_Indonesia_201803020320.nc")

i_xy = which(IR < 200,arr.ind = T)
xy = data.frame(x = lon[i_xy[,1]], y = lat[i_xy[,2]])
coordinates(xy) = ~ x + y
proj4string(xy) = proj4string(kec)

cl = makeCluster(4)
registerDoParallel(cl)
strt<-Sys.time()
i_ada = foreach(i = 1:length(kec)) %dopar%
  any(!is.na(sp::over(xy, kec[i,])))
finish =  (Sys.time()-strt)
print(finish)
stopCluster(cl)
i_ada = unlist(i_ada)


# se - negara 

selected = kec$Kecamatan[unlist(i_ada)]
S_KEC = c()
S_KAB = c()
S_PROV = c()
S_PROV = str_to_title(S_PROV)
for(i in 1:length(selected)){
  i_selected = which(kec$Kecamatan == selected[i])
  S_PROV[i] = as.character(kec$Provinsi[i_selected])
  S_KAB[i] = as.character(kec$Kabupaten [i_selected])
  S_KEC[i] = as.character(kec$Kecamatan[i_selected])
}

prov = list()
uprov = unique(S_PROV)
for(i in 1:length(uprov)){
  i_selected = which(as.character(S_PROV) == uprov[i])
  prov[[i]] = as.character(S_KAB[i_selected])
}




