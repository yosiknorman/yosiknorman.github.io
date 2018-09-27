FUNCTION f(x)
    IMPLICIT NONE
    INTEGER,PARAMETER        :: RP = SELECTED
    REAL
    KIND(15)
    REAL(KIND=RP),INTENT(IN) :: x
    REAL(KIND=RP)            :: f
    f = x**3 - x + COS(x)
END FUNCTION f