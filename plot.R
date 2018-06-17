library(leaflet)
kc =kec[i_SULSEL,]


kc.abb = kc$Kecamatan
kc.abb = gsub(pattern = "a", replacement = "",kc.abb)
kc.abb = gsub(pattern = "i", replacement = "",kc.abb)
kc.abb = gsub(pattern = "u", replacement = "",kc.abb)
kc.abb = gsub(pattern = "e", replacement = "",kc.abb)
kc.abb = gsub(pattern = "o", replacement = "",kc.abb)
kc.abb = gsub(pattern = " ", replacement = "",kc.abb)
nchar(kc.abb)
cx = c()
cy = c()
for(i in 1:(length(kc)-1)){
  cx[i] = kc@polygons[[i]]@labpt[1]
  cy[i] = kc@polygons[[i]]@labpt[2]
}

pisah_kab = c()
poly_kab = list()
ikab = list()
ukab = unique(kc$Kabupaten)
for(i in 1:(length(ukab)-1)){
  ikab[[i]] = which(kc$Kabupaten == ukab[i])
  poly_kab[[i]] = kc[ikab[[i]],]
}



min(cy)
library(leaflet.extras)


library(viridis)
ncol = colorRampPalette(c("darkolivegreen","aquamarine4","chartreuse1","red", "purple", "goldenrod4"
                          "dodgerblue1","yellow","deeppink", "grey","ightcoral","plum"))

m = leaflet() %>% addTiles()
for(i in 1:length(poly_kab)){
  # addPulseMarkers(lng = cx, lat = cy, icon = makePulseIcon(heartbeat = 0.5))
  m = m %>% addPolygons(data = poly_kab[[i]], color = ncol(24)[i] )
}

representatif = c("Bantaeng",
  "Barru",
  "Watampone",
  "Bulukumba",
  "Enrekang",
  "Sungguminasa",
  "Bontosunggu",
  "Benteng",
  "Belopa", "Malili", "Masamba", "Turikale", "Pangkajene", "Pinrang", "Sidenreng", 
  "Balangnipa", "Watansoppeng", "Pattalassang", "Makale", "Rantepao", "Sengkang", 
  "Makassar", "Palopo", "Pare Pare")

i_rep = c()
for(i in 1:(length(representatif))){
  if(any(which(kc$Kecamatan == representatif[i] ))  ){
    i_rep[i] = which(kc$Kecamatan == representatif[i] )    
  }else{
    print("tak ada")
    i_rep[i] = NA
  }
}

  i_na = which(is.na(i_rep))
  i_na