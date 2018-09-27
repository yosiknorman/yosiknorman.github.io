PROGRAM functionExample
    IMPLICIT NONE
    INTEGER,PARAMETER :: RP = SELECTED
    REAL
    KIND(15)
    REAL(KIND=RP)     :: x,y
    REAL(KIND=RP),EXTERNAL   :: f
    x = 3.0
    RP
    y = f(x)
    PRINT*,y
END PROGRAM functionExample