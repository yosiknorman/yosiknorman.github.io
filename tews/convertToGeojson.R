#!/usr/bin/Rscript

library(maps)
library(rgdal)
library(leaflet)
library(geojsonio)
library(sp)
library(GISTools)



dt = read.delim("filter.txt", sep = "|", header = T)
dt = dt[,2:dim(dt)[2]]
dt = dt[2:dim(dt)[1],]
rownames(dt) = 1:length(dt[,1])

dt$Lon = gsub(pattern = " E", replacement = "",dt$Lon)
dt$Lon = gsub(pattern = " W", replacement = "",dt$Lon)
indexS = grep(dt$Lat, pattern = "S")
dt$Lat = gsub(pattern = " S", replacement = "",dt$Lat)
dt$Lat = gsub(pattern = " N", replacement = "",dt$Lat)
dt$Lat[indexS] = as.numeric(dt$Lat[indexS])*(-1)

kata_kata = paste0(dt$Origin.Time..GMT., " pada Kedalaman ", dt$Depth, " Dengan M ", dt$Mag, " di Wilayah ", dt$Remarks)

TT = as.POSIXct(dt$Origin.Time..GMT., tz = "UTC")
TW = TT
TWita = as.POSIXct(as.character(TW), tz = "WITA")
jso = data.frame(lon = dt$Lon, lat = dt$Lat,Time = TWita,  Mag = dt$Mag, Depth = dt$Depth, Status = dt$Status, 
                 TypeMag = dt$TypeMag, Remarks = dt$Remarks)
if(any(is.na(dt$Lon) | is.na(dt$Lat))){
  i_lon = c(which(is.na(as.numeric(dt$Lon)))) 
            
  i_lat = which(is.na(as.numeric(dt$Lat) ))
  iii = 1:dim(jso)[1]
  jso = jso[!iii %in% c(i_lon,i_lat),]
  
}
iii = 1:dim(jso)[1]
i_lon = which(as.numeric(as.character(dt$Lon)) > 90 & as.numeric(as.character(dt$Lon)) < 150)
jso = jso[iii %in% c(i_lon),]
i_lat = which(as.numeric(as.character(jso$lat)) > -15 & as.numeric(as.character(jso$lat)) < 15)
jso = jso[iii %in% c(i_lat),]  

jsobackup = jso

jso = head(jso, 200L)




oke = cbind(as.numeric(as.character(jso$lon)),as.numeric(as.character(jso$lat)))
okebackup = cbind(as.numeric(as.character(jsobackup$lon)),as.numeric(as.character(jsobackup$lat)))

json <- SpatialPointsDataFrame(oke, jso[, 3:dim(jso)[2]])
jsonback <- SpatialPointsDataFrame(okebackup, jsobackup[, 3:dim(jsobackup)[2]])
head(jsobackup)

geojsonio::geojson_write(file = "~/tews/data_mag.geojson",(jsonback))  





kata_kata = paste0("<h2>",jso$Time, " pada dedalaman ", jso$Depth, " dengan M ", jso$Mag, " di Wilayah ", jso$Remarks, "</h2>")

df.20 <- jso

getColor <- function(quakes) {
  sapply(as.numeric(quakes$Mag), function(Mag) {
    if(Mag <= 4) {
      "green"
    } else if(Mag <= 5) {
      "orange"
    } else {
      "red"
    } })
}

colll = getColor(jso)



icons <- awesomeIcons(
  icon = 'ios-close',
  iconColor = 'black',
  library = 'ion',
  markerColor = getColor(jso)
)

pal = colorNumeric(
  palette = "Greens",
  domain = json$Mag
)


library(leaflet.extras)
icon.pop <- pulseIcons(color = ifelse(as.numeric(json$Mag) < 4,'blue','red'),
                       heartbeat = ifelse(as.numeric(json$Depth) > 50 ,'2','0.7'))
icon.pop$color[which(json$Mag >= 5)] = "red"
icon.pop$color[which(json$Mag < 5)] = "blue"
json$Depth = gsub(pattern = " km",replacement = "", json$Depth)

icon.pop$heartbeat[which(as.numeric(json$Depth) >= 50)] = '1.5'
icon.pop$heartbeat[which(as.numeric(json$Depth) < 50)] = '0.7'

kata_kata = paste0("<h2>",json$Time, " pada kedalaman ", json$Depth, " km dengan M ", json$Mag, " di Wilayah ", json$Remarks, "</h2>")

html_legend <- paste0("<h2 style='font-size:1em; line-height: 0.1'>
<center><img src='map_quake_files/png/RDCA.png'> M >5 &nbsp

<img src='map_quake_files/png/jadi.png' height='36px' width='30px'></center>
<h4 style='font-size:1em; color:black; text-align: center; '>
 ", "BBMKG IV Makassar","</h4>")


dfq = cbind(as.numeric(as.character(jsobackup$lon)), 
            as.numeric(as.character(jsobackup$lat)))
dfq = data.frame(dfq)
colnames(dfq) = c('lng', 'lat')


icon.pop1=list()
for(i in 1:length(icon.pop)){
  icon.pop1[[i]] = icon.pop[[i]][1]
}
names(icon.pop1) = names(icon.pop)

icon.pop2=list()
for(i in 1:length(icon.pop)){
  icon.pop2[[i]] = icon.pop[[i]][2:length(icon.pop[[i]])]
}
names(icon.pop2) = names(icon.pop)


# leaflet(data.frame(dfq)) %>%
#   addProviderTiles(providers$CartoDB.Positron) %>%
#   addWebGLHeatmap(lng=~lng, lat=~lat,size=dim(dfq)[1])


map = leaflet(data.frame(dfq)) %>%
      addWebGLHeatmap(lng=~lng, lat=~lat,size=dim(dfq)[1]) %>% 
    addProviderTiles("Esri") %>% setView(lng = 122, lat = -1, zoom = 5) %>%

addPulseMarkers(lng = oke[2:dim(oke)[1],1], lat = oke[2:dim(oke)[1],2],
                label = as.character(json$Remarks[2:dim(json)[1]]),
                labelOptions = rep(labelOptions(noHide = F),nrow(jso)),
                icon = icon.pop2,popup = as.character(kata_kata[2:length(kata_kata)]),
                clusterOptions = markerClusterOptions()) %>%
  addControl(html = html_legend, position = "bottomleft") %>%
  addPulseMarkers(lng = oke[1,1], lat = oke[1,2],
                  
                  label = paste0("Last event: ",as.character(json$Remarks[1])),
                  # labelOptions = rep(labelOptions(noHide = T),nrow(jso)),
                  
                  icon = icon.pop1, popup = as.character(kata_kata[1]),
            
                  # label = output_VHR$Kecamatan,
                  
                  labelOptions = 
                    labelOptions(noHide = T,
                    style = list("font-weight" = "bold", padding = "3px 8px"),
                    textsize = "15px",
                    direction = "auto")
                  
                  ) 


# library(leaflet.minicharts)
# ?leaflet.minicharts::popupArgs
library(htmlwidgets)
saveWidget(file = "map_quake.html", map, selfcontained = F)
# 
# 
# data("eco2mixBalance")
# bal <- eco2mixBalance
# leaflet() %>% addTiles() %>%
#   addFlows(
#     as.numeric(bal$lng0), as.numeric(bal$lat0), as.numeric(bal$lng1), as.numeric(bal$lat1),
#     flow = bal$balance,
#     time = bal$month,
#     color = "navy"
#   )


