       IDENTIFICATION DIVISION.
       PROGRAM-ID. PARITY-LEGACY.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT IN-FILE  ASSIGN TO "inputs.csv"
               ORGANIZATION IS LINE SEQUENTIAL.
           SELECT OUT-FILE ASSIGN TO "legacy_outputs.csv"
               ORGANIZATION IS LINE SEQUENTIAL.
       DATA DIVISION.
       FILE SECTION.
       FD IN-FILE.
       01 IN-REC  PIC X(200).
       FD OUT-FILE.
       01 OUT-REC PIC X(200).
       WORKING-STORAGE SECTION.
       01 WS-EOF        PIC X VALUE "N".
       01 WS-FIRST      PIC X VALUE "Y".
       01 WS-SEQ        PIC X(10).
       01 WS-PRIN       PIC 9(9)V99.
       01 WS-RATE       PIC 9V9999.
       01 WS-TERM       PIC 99.
       01 WS-GROSS      PIC 9(9)V99.
       01 WS-TAXR       PIC 9V9999.
       01 WS-FINAL      PIC 9(13)V99 COMP-3.
       01 WS-TAX        PIC 9(13)V99 COMP-3.
       01 WS-NET        PIC 9(13)V99 COMP-3.
       01 WS-I          PIC 99.
       01 F-PRIN        PIC X(15).
       01 F-RATE        PIC X(10).
       01 F-TERM        PIC X(4).
       01 F-GROSS       PIC X(15).
       01 F-TAXR        PIC X(10).
       01 E-FINAL       PIC Z(12)9.99.
       01 E-NET         PIC Z(12)9.99.
       01 S-FINAL       PIC X(16).
       01 S-NET         PIC X(16).
       PROCEDURE DIVISION.
       MAIN.
           OPEN INPUT IN-FILE OUTPUT OUT-FILE
           MOVE "seq,final_amount,net_pay" TO OUT-REC
           WRITE OUT-REC
           PERFORM UNTIL WS-EOF = "Y"
             READ IN-FILE INTO IN-REC
               AT END MOVE "Y" TO WS-EOF
               NOT AT END
                 IF WS-FIRST = "Y"
                   MOVE "N" TO WS-FIRST
                 ELSE
                   PERFORM PROCESS-ROW
                 END-IF
             END-READ
           END-PERFORM
           CLOSE IN-FILE OUT-FILE
           STOP RUN.
       PROCESS-ROW.
           UNSTRING IN-REC DELIMITED BY ","
             INTO WS-SEQ F-PRIN F-RATE F-TERM F-GROSS F-TAXR
           COMPUTE WS-PRIN  = FUNCTION NUMVAL(F-PRIN)
           COMPUTE WS-RATE  = FUNCTION NUMVAL(F-RATE)
           COMPUTE WS-TERM  = FUNCTION NUMVAL(F-TERM)
           COMPUTE WS-GROSS = FUNCTION NUMVAL(F-GROSS)
           COMPUTE WS-TAXR  = FUNCTION NUMVAL(F-TAXR)
           MOVE WS-PRIN TO WS-FINAL
           PERFORM VARYING WS-I FROM 1 BY 1 UNTIL WS-I > WS-TERM
             COMPUTE WS-FINAL ROUNDED = WS-FINAL * (1 + WS-RATE)
           END-PERFORM
           COMPUTE WS-TAX ROUNDED = WS-GROSS * WS-TAXR
           COMPUTE WS-NET = WS-GROSS - WS-TAX
           MOVE WS-FINAL TO E-FINAL
           MOVE E-FINAL  TO S-FINAL
           MOVE WS-NET   TO E-NET
           MOVE E-NET    TO S-NET
           MOVE SPACES   TO OUT-REC
           STRING FUNCTION TRIM(WS-SEQ)  DELIMITED BY SIZE
                  ","                    DELIMITED BY SIZE
                  FUNCTION TRIM(S-FINAL) DELIMITED BY SIZE
                  ","                    DELIMITED BY SIZE
                  FUNCTION TRIM(S-NET)   DELIMITED BY SIZE
                  INTO OUT-REC
           WRITE OUT-REC.
